import { Octokit } from '@octokit/core'
import * as Sentry from '@sentry/cloudflare'
import { Hono } from 'hono'
import { accepts } from 'hono/accepts'
import { html, raw } from 'hono/html'
import { sql } from 'kysely'
import { jsonArrayFrom } from 'kysely/helpers/postgres'
import { customAlphabet } from 'nanoid'
import Stripe from 'stripe'
import { estimateTokenCount } from 'tokenx'
import { stringify as yamlStringify } from 'yaml'
import { z } from 'zod'
import { createClient, type Database } from '#db/client.ts'
import * as DbSchema from '#db/schemas.gen.ts'
import type { DB } from '#db/types.gen.ts'
import { requestTokensSavedSql } from '#db/utils.ts'
import * as ApiKey from '#lib/apiKey.ts'
import * as Constants from '#lib/constants.ts'
import * as Cookie from '#lib/cookie.ts'
import * as Crypto from '#lib/crypto.ts'
import * as GitHub from '#lib/github.ts'
import * as hono from '#lib/hono.ts'
import * as Nanoid from '#lib/nanoid.ts'
import * as SessionToken from '#lib/sessionToken.ts'
import * as StripeUtils from '#lib/stripe.ts'
import * as Md from '#md/index.ts'
import * as Og from '#og.tsx'

export const api = new Hono<{
  Bindings: Cloudflare.Env
  Variables: {
    api_key_id: string | null
    bearer_token: string | null
    db: Database
    organization_id: string | null
    session: Pick<DB.session, 'account_id'> | null
  }
}>()
  .onError((error, c) => {
    const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined
    if (!status || status <= 299 || status >= 500) {
      const spanName = `${c.req.method} ${c.req.path}`
      const activeSpan = Sentry.getActiveSpan()
      if (activeSpan) {
        activeSpan.updateName(spanName)
        Sentry.updateSpanName(Sentry.getRootSpan(activeSpan), spanName)
      }
      Sentry.getIsolationScope().setTransactionName(spanName)
      Sentry.captureException(error, {
        mechanism: { handled: false, type: 'auto.faas.hono.error_handler' },
      })
    }
    return c.json({ code: 'internal_error', message: 'Internal server error' }, 500)
  })
  .use(async (c, next) => {
    c.set('db', createClient(c.env.DB.connectionString))

    c.set('api_key_id', null)
    c.set('bearer_token', null)
    c.set('organization_id', null)
    c.set('session', null)

    // Extract auth inputs once for the request.
    const cookie = (await Cookie.getSigned(c, c.env.COOKIE_SECRET, 'curl.session')) || undefined
    const bearerToken = (() => {
      // CLI and API clients authenticate with Bearer tokens.
      const authorizationHeader = c.req.header('authorization')
      return authorizationHeader?.startsWith('Bearer ')
        ? authorizationHeader.replace('Bearer ', '')
        : undefined
    })()
    if (bearerToken) c.set('bearer_token', bearerToken)
    const authToken = bearerToken ?? c.req.query('token') ?? c.req.query('t')

    // 1. API keys never override a browser session cookie.
    if (!cookie && authToken && ApiKey.isApiKey(authToken)) {
      const keyHash = await ApiKey.hash(authToken)
      const apiKey = await c.var.db
        .selectFrom('api_key')
        .where('key_hash', '=', keyHash)
        .where('deleted_at', 'is', null)
        .select(['id', 'account_id', 'organization_id', 'last_used_at'])
        .executeTakeFirst()
      if (!apiKey) return c.json({ code: 'invalid_api_key', message: 'Invalid API key' }, 401)
      c.set('api_key_id', apiKey.id)
      c.set('organization_id', apiKey.organization_id)
      c.set('session', { account_id: apiKey.account_id })
      if (
        !apiKey.last_used_at ||
        Date.now() - new Date(apiKey.last_used_at).getTime() > 3_600_000 // 1 hour
      )
        c.executionCtx.waitUntil(
          c.var.db
            .updateTable('api_key')
            .set('last_used_at', new Date())
            .where('id', '=', apiKey.id)
            .execute(),
        )
      await next()
      return
    }

    // 2. Resolve the browser session from the signed cookie.
    if (cookie) {
      const session =
        (await c.var.db
          .selectFrom('session')
          .where('id', '=', cookie)
          .where('expires_at', '>', new Date())
          .select('account_id')
          .executeTakeFirst()) ?? null
      c.set('session', session)
    }

    // 3. If the cookie was missing or stale, fall back to CLI bearer auth.
    if (!c.var.session && bearerToken) {
      // CLI access tokens are short-lived session_access_token rows tied to cli sessions.
      const tokenHash = await ApiKey.hash(bearerToken)
      const session =
        (await c.var.db
          .selectFrom('session_access_token')
          .innerJoin('session', 'session.id', 'session_access_token.session_id')
          .where('session.session_type', '=', 'cli')
          .where('session_access_token.expires_at', '>', new Date())
          .where('session.expires_at', '>', new Date())
          .where('session_access_token.token_hash', '=', tokenHash)
          .select('session.account_id')
          .executeTakeFirst()) ?? null
      c.set('session', session)
    }

    // Resolve organization membership
    const orgHeader = c.req.header('x-organization-id')
    if (c.var.session && orgHeader) {
      const member = await c.var.db
        .selectFrom('organization_member')
        .where('organization_id', '=', orgHeader)
        .where('account_id', '=', c.var.session.account_id)
        .select('id')
        .executeTakeFirst()
      if (member) c.set('organization_id', orgHeader)
    }

    await next()
  })
  .get(
    '/api/auth/github',
    hono.validator(
      'query',
      z.object({
        next: z.optional(z.union([z.string(), z.undefined()])),
      }),
    ),
    (c) => {
      if (hono.narrowValidation) return hono.validationError(c)
      const query = c.req.valid('query')
      const state = crypto.randomUUID()
      Cookie.set(c, 'curl.state', state, {
        httpOnly: true,
        maxAge: 600, // 10m
        sameSite: 'Lax',
        ...Cookie.secureOpts(c.req.url, c.env.HOST, c.req.header('x-forwarded-proto')),
      })

      const origin = (() => {
        // Respect the public protocol when the app is behind a proxy.
        const url = new URL(c.req.url)
        const proto = c.req.header('x-forwarded-proto')
        if (proto) url.protocol = `${proto}:`
        return url.origin
      })()
      const callbackUrl = new URL(`/api/auth/github/callback`, origin)
      if (query.next) {
        try {
          const nextUrl = new URL(query.next, origin)
          if (nextUrl.origin === origin || nextUrl.hostname.endsWith(Cookie.getDomain(c.env.HOST)))
            callbackUrl.searchParams.set('next', query.next)
        } catch {}
      }

      const url = new URL(`${c.env.GH_URL}/login/oauth/authorize`)
      url.searchParams.set('client_id', c.env.GH_CLIENT_ID)
      url.searchParams.set('redirect_uri', callbackUrl.toString())
      url.searchParams.set('state', state)
      return c.redirect(url.toString())
    },
  )
  .get(
    '/api/auth/github/callback',
    hono.validator(
      'query',
      z.object({
        code: z.string(),
        next: z.optional(z.union([z.string(), z.undefined()])),
        state: z.string(),
      }),
    ),
    async (c) => {
      if (hono.narrowValidation) return hono.validationError(c)
      const query = c.req.valid('query')

      // Redirect to preview callback before reading/destroying the state cookie
      // so the preview worker can validate it
      if (query.next) {
        try {
          const nextUrl = new URL(query.next)
          if (
            nextUrl.hostname !== c.env.HOST &&
            nextUrl.hostname.endsWith(Cookie.getDomain(c.env.HOST))
          ) {
            const previewCallback = new URL('/api/auth/github/callback', nextUrl.origin)
            previewCallback.searchParams.set('code', query.code)
            previewCallback.searchParams.set('state', query.state)
            return c.redirect(previewCallback.toString())
          }
        } catch {}
      }

      const cookieState = Cookie.get(c, 'curl.state')
      Cookie.destroy(
        c,
        'curl.state',
        Cookie.secureOpts(c.req.url, c.env.HOST, c.req.header('x-forwarded-proto')),
      )
      const origin = (() => {
        // Respect the public protocol when the app is behind a proxy.
        const url = new URL(c.req.url)
        const proto = c.req.header('x-forwarded-proto')
        if (proto) url.protocol = `${proto}:`
        return url.origin
      })()
      const errorUrl = new URL('/auth/error', origin)
      if (!cookieState || cookieState !== query.state) {
        errorUrl.searchParams.set('error', 'invalid_request')
        errorUrl.searchParams.set('error_description', 'State mismatch')
        return c.redirect(errorUrl.toString())
      }

      let tokenData: z.infer<typeof tokenDataSchema>
      const tokenDataSchema = z.object({
        access_token: z.string(),
        expires_in: z.number().optional(),
        refresh_token: z.string().optional(),
        refresh_token_expires_in: z.number().optional(),
        scope: z.string(),
        token_type: z.literal('bearer'),
      })
      try {
        const tokenRes = await fetch(`${c.env.GH_URL}/login/oauth/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            client_id: c.env.GH_CLIENT_ID,
            client_secret: c.env.GH_CLIENT_SECRET,
            code: query.code,
          }),
        })
        const tokenResponseSchema = z.union([
          tokenDataSchema,
          z.object({
            error: z.enum([
              'bad_verification_code',
              'incorrect_client_credentials',
              'redirect_uri_mismatch',
              'unverified_user_email',
            ]),
            error_description: z.string(),
            error_uri: z.string(),
          }),
        ])
        const json = z.parse(tokenResponseSchema, await tokenRes.json())
        if ('error' in json) {
          errorUrl.searchParams.set('error', json.error)
          errorUrl.searchParams.set('error_description', 'Failed to get access token')
          return c.redirect(errorUrl.toString())
        }
        tokenData = json
      } catch {
        errorUrl.searchParams.set('error', 'server_error')
        errorUrl.searchParams.set('error_description', 'Failed to reach GitHub')
        return c.redirect(errorUrl.toString())
      }

      const octokit = new Octokit({ auth: tokenData.access_token, baseUrl: c.env.GH_API_URL })
      const [userRes, emailsRes] = await Promise.all([
        octokit.request('GET /user').catch((e: Error) => e),
        octokit.request('GET /user/emails').catch((e: Error) => e),
      ])
      if (userRes instanceof Error) {
        errorUrl.searchParams.set('error', 'server_error')
        errorUrl.searchParams.set(
          'error_description',
          `Failed to fetch GitHub profile: ${userRes.message}`,
        )
        return c.redirect(errorUrl.toString())
      }
      if (emailsRes instanceof Error) {
        errorUrl.searchParams.set('error', 'server_error')
        errorUrl.searchParams.set(
          'error_description',
          `Failed to fetch GitHub emails: ${emailsRes.message}`,
        )
        return c.redirect(errorUrl.toString())
      }

      const primaryEmail = emailsRes.data.find((e) => e.primary)?.email ?? emailsRes.data[0]?.email
      if (!primaryEmail) {
        errorUrl.searchParams.set('error', 'no_email')
        errorUrl.searchParams.set('error_description', 'No email found on GitHub account')
        return c.redirect(errorUrl.toString())
      }

      const crewGitHubIds = new Set([6759464, 7336481])
      const role = crewGitHubIds.has(userRes.data.id) ? 'crew' : 'user'

      let result: { accountId: string; sessionId: string }
      try {
        result = await c.var.db.transaction().execute(async (tx) => {
          const existing = await tx
            .selectFrom('account_provider')
            .where('provider', '=', 'github')
            .where('provider_account_id', '=', String(userRes.data.id))
            .select('account_id')
            .executeTakeFirst()

          const accountId = existing
            ? (
                await tx
                  .updateTable('account')
                  .set({
                    avatar_url: userRes.data.avatar_url,
                    email: primaryEmail,
                    name: userRes.data.name,
                    role,
                  })
                  .where('id', '=', existing.account_id)
                  .returning('id')
                  .executeTakeFirstOrThrow()
              ).id
            : await (async () => {
                const values = {
                  avatar_url: userRes.data.avatar_url,
                  email: primaryEmail,
                  login: userRes.data.login,
                  name: userRes.data.name,
                  role,
                } satisfies DB.Insertable.account
                const inserted =
                  (await tx
                    .insertInto('account')
                    .values(values)
                    .onConflict((oc) => oc.column('login').doNothing())
                    .returning('id')
                    .executeTakeFirst()) ??
                  (await tx
                    .insertInto('account')
                    .values({
                      ...values,
                      login: `${userRes.data.login}-${Nanoid.generate()}`,
                    })
                    .returning('id')
                    .executeTakeFirstOrThrow())
                await tx
                  .insertInto('account_provider')
                  .values({
                    account_id: inserted.id,
                    provider: 'github',
                    provider_account_id: String(userRes.data.id),
                  })
                  .execute()
                return inserted.id
              })()

          const now = new Date()
          const access_token_expires_at = tokenData.expires_in
            ? new Date(now.getTime() + tokenData.expires_in * 1000)
            : null
          const refresh_token_expires_at = tokenData.refresh_token_expires_in
            ? new Date(now.getTime() + tokenData.refresh_token_expires_in * 1000)
            : null
          const encryptedAccessToken = await Crypto.encrypt(
            tokenData.access_token,
            c.env.TOKEN_ENCRYPTION_KEY,
          )
          const encryptedRefreshToken = tokenData.refresh_token
            ? await Crypto.encrypt(tokenData.refresh_token, c.env.TOKEN_ENCRYPTION_KEY)
            : null
          await tx
            .insertInto('account_provider')
            .values({
              account_id: accountId,
              provider: 'github',
              provider_account_id: String(userRes.data.id),
              access_token: encryptedAccessToken,
              refresh_token: encryptedRefreshToken,
              access_token_expires_at,
              refresh_token_expires_at,
            })
            .onConflict((oc) =>
              oc.columns(['provider', 'provider_account_id']).doUpdateSet({
                access_token: encryptedAccessToken,
                refresh_token: encryptedRefreshToken,
                access_token_expires_at,
                refresh_token_expires_at,
              }),
            )
            .execute()

          const session = await tx
            .insertInto('session')
            .values({
              account_id: accountId,
              expires_at: sql<Date>`now() + interval '30 days'`,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

          return { accountId, sessionId: session.id }
        })
      } catch (error) {
        Sentry.captureException(error)
        errorUrl.searchParams.set('error', 'server_error')
        errorUrl.searchParams.set('error_description', 'Something went wrong creating your account')
        return c.redirect(errorUrl.toString())
      }

      await Cookie.setSigned(c, 'curl.session', result.sessionId, c.env.COOKIE_SECRET, {
        httpOnly: true,
        maxAge: 2592000, // 30 days
        sameSite: 'Lax',
        ...Cookie.secureOpts(c.req.url, c.env.HOST, c.req.header('x-forwarded-proto')),
      })

      if (query.next) {
        try {
          const nextUrl = new URL(query.next, origin)
          if (nextUrl.origin === origin || nextUrl.hostname.endsWith(Cookie.getDomain(c.env.HOST)))
            return c.redirect(nextUrl.toString())
        } catch {}
      }

      const accountRow = await c.var.db
        .selectFrom('account')
        .where('id', '=', result.accountId)
        .select('login')
        .executeTakeFirstOrThrow()
      return c.redirect(`${origin}/${accountRow.login}`)
    },
  )
  .post('/api/auth/device', async (c) => {
    const rateLimit = await hono.rateLimit(c.env.KV, c.executionCtx, {
      ip: c.req.header('cf-connecting-ip') ?? 'unknown',
      key: 'device',
      max: 15,
      window: 60,
    })
    if (rateLimit.error)
      return c.json({ code: 'rate_limit_exceeded' as const, message: 'Rate limit exceeded' }, 429, {
        'retry-after': String(rateLimit.reset - Math.floor(Date.now() / 1000)),
      })

    const code = Nanoid.generate()
    const user_code = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8)()
    await c.var.db
      .insertInto('device_code')
      .values({
        code,
        expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        status: 'pending',
        user_code,
      })
      .execute()
    return c.json(
      {
        code,
        interval: 1,
        user_code,
        verification_uri: `https://${c.env.HOST}/auth/device`,
      },
      200,
    )
  })
  .post(
    '/api/auth/device/confirm',
    hono.validator('json', z.object({ user_code: z.string() })),
    async (c) => {
      if (hono.narrowValidation) return hono.validationError(c)
      const requestOrigin = (() => {
        // Compare browser-provided origins against the externally visible origin.
        const url = new URL(c.req.url)
        const proto = c.req.header('x-forwarded-proto')
        if (proto) url.protocol = `${proto}:`
        return url.origin
      })()
      const origin = c.req.header('origin')
      const refererOrigin = (() => {
        const referer = c.req.header('referer')
        if (!referer) return null
        try {
          return new URL(referer).origin
        } catch {
          return null
        }
      })()
      if (origin !== requestOrigin && refererOrigin !== requestOrigin)
        return c.json(
          { code: 'invalid_origin' as const, message: 'Request origin not allowed' },
          403,
        )
      if (!c.var.session)
        return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)
      const json = c.req.valid('json')
      const row = await c.var.db
        .selectFrom('device_code')
        .where('user_code', '=', json.user_code)
        .where('status', '=', 'pending')
        .where('expires_at', '>', new Date())
        .select('id')
        .executeTakeFirst()
      if (!row)
        return c.json(
          { code: 'invalid_or_expired_code' as const, message: 'Invalid or expired code' },
          404,
        )
      await c.var.db
        .updateTable('device_code')
        .set({
          account_id: c.var.session.account_id,
          status: 'approved',
        })
        .where('id', '=', row.id)
        .execute()
      return c.json({ ok: true }, 200)
    },
  )
  .post(
    '/api/auth/device/token',
    hono.validator('json', z.object({ code: z.string() })),
    async (c) => {
      if (hono.narrowValidation) return hono.validationError(c)

      const rateLimit = await hono.rateLimit(c.env.KV, c.executionCtx, {
        ip: c.req.header('cf-connecting-ip') ?? 'unknown',
        key: 'device_token',
        max: 30,
        window: 60,
      })
      if (rateLimit.error)
        return c.json(
          { code: 'rate_limit_exceeded' as const, message: 'Rate limit exceeded' },
          429,
          {
            'retry-after': String(rateLimit.reset - Math.floor(Date.now() / 1000)),
          },
        )

      const json = c.req.valid('json')
      const now = new Date()
      const result = await c.var.db.transaction().execute(async (tx) => {
        const deviceCode = await tx
          .deleteFrom('device_code')
          .where('code', '=', json.code)
          .where('status', '=', 'approved')
          .where('expires_at', '>', now)
          .returning('account_id')
          .executeTakeFirst()
        if (deviceCode?.account_id)
          return {
            auth: await SessionToken.createCliSession(tx as Database, deviceCode.account_id),
          }

        const existing = await tx
          .selectFrom('device_code')
          .where('code', '=', json.code)
          .select(['expires_at', 'status'])
          .executeTakeFirst()
        if (!existing || existing.expires_at <= now)
          return {
            error: { code: 'expired_token' as const, message: 'Token has expired' },
          }
        if (existing.status === 'pending')
          return {
            error: { code: 'authorization_pending' as const, message: 'Authorization pending' },
          }
        return {
          error: { code: 'expired_token' as const, message: 'Token has expired' },
        }
      })
      if ('error' in result) return c.json(result.error, 400)

      const auth = result.auth
      return c.json(auth, 200)
    },
  )
  .post('/api/auth/headers', async (c) => {
    if (c.var.api_key_id)
      return c.json(
        {
          code: 'api_key_not_supported' as const,
          message: 'API keys do not mint interactive auth headers',
        },
        403,
      )

    if (c.var.bearer_token) {
      const auth = await SessionToken.mintAuthHeaders(c.var.db, c.var.bearer_token)
      if (auth) return c.json(auth, 200)
      return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)
    }

    if (!c.var.session)
      return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

    const auth = await SessionToken.createCliSession(c.var.db, c.var.session.account_id)
    return c.json(auth, 200)
  })
  .post('/api/auth/logout', async (c) => {
    const sessionId = await Cookie.getSigned(c, c.env.COOKIE_SECRET, 'curl.session')
    if (sessionId) await c.var.db.deleteFrom('session').where('id', '=', sessionId).execute()
    if (c.var.bearer_token) await SessionToken.deleteCliSessionByToken(c.var.db, c.var.bearer_token)
    Cookie.destroy(c, 'curl.session', {
      httpOnly: true,
      maxAge: 0,
      sameSite: 'Lax',
      ...Cookie.secureOpts(c.req.url, c.env.HOST, c.req.header('x-forwarded-proto')),
    })
    return c.json({ ok: true }, 200)
  })
  .get('/api/auth/me', async (c) => {
    if (!c.var.session) return c.json({ account: null }, 200)

    const account = await c.var.db
      .selectFrom('account')
      .where('id', '=', c.var.session.account_id)
      .select((eb) => [
        'avatar_url',
        'email',
        'id',
        'login',
        'name',
        'role',
        jsonArrayFrom(
          eb
            .selectFrom('organization_member')
            .innerJoin('organization', 'organization.id', 'organization_member.organization_id')
            .whereRef('organization_member.account_id', '=', 'account.id')
            .where('organization.deleted_at', 'is', null)
            .select([
              'organization.created_at',
              'organization.id',
              'organization.login',
              'organization.name',
            ]),
        ).as('organizations'),
      ])
      .executeTakeFirst()
    if (!account) return c.json({ account: null }, 200)

    return c.json({ account }, 200)
  })
  .get(
    '/api/cli/latest',
    hono.validator(
      'query',
      z.object({
        arch: z.string().optional(),
        current: z.string().optional(),
        os: z.string().optional(),
        standalone: z.string().optional(),
      }),
    ),
    // TODO: log install/update analytics from query params (current, os, arch, standalone)
    async (c) => {
      if (hono.narrowValidation) return hono.validationError(c)

      // Try KV cache first
      const cached = await c.env.KV.get('cli:latest', 'json')
      if (cached)
        return c.json(
          {
            published_at: cached.published_at,
            version: cached.version,
          },
          200,
        )

      // Fetch from npm registry
      const res = await fetch(`https://registry.npmjs.org/${Constants.packageName}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok)
        return c.json({ code: 'upstream_error' as const, message: 'Upstream request failed' }, 502)

      const npm = z.safeParse(
        z.object({
          'dist-tags': z.object({ latest: z.string() }).optional(),
          time: z.record(z.string(), z.string()).optional(),
        }),
        await res.json(),
      )
      if (!npm.success || !npm.data['dist-tags']?.latest)
        return c.json({ code: 'version_not_found' as const, message: 'Version not found' }, 502)

      const version = npm.data['dist-tags'].latest
      const result = {
        published_at: npm.data.time?.[version] ?? null,
        version,
      } as const
      c.executionCtx.waitUntil(
        c.env.KV.put('cli:latest', JSON.stringify(result), {
          expirationTtl: 300, // 5 minutes
        }),
      )
      return c.json(result, 200)
    },
  )
  .get('/api/credits', async (c) => {
    if (!c.var.session)
      return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

    const organizationId = c.var.organization_id

    if (organizationId) {
      const member = await c.var.db
        .selectFrom('organization_member')
        .where('organization_id', '=', organizationId)
        .where('account_id', '=', c.var.session.account_id)
        .select('role')
        .executeTakeFirst()
      if (!member || (member.role !== 'owner' && member.role !== 'admin'))
        return c.json(
          { code: 'organization_access_denied', message: 'Organization access denied' },
          403,
        )
    }

    const entityType = organizationId ? 'organization' : 'account'
    const entityId = organizationId ?? c.var.session.account_id
    const billing = await c.var.db
      .selectFrom(entityType)
      .where('id', '=', entityId)
      .select(['balance_mills', 'default_payment_method_id', 'stripe_customer_id'])
      .executeTakeFirst()
    if (!billing) return c.json({ code: 'not_found' as const, message: 'Not found' }, 404)

    let method: Pick<Stripe.PaymentMethod.Card, 'brand' | 'last4'> | null = null
    if (billing.stripe_customer_id) {
      const stripe = new Stripe(
        c.env.STRIPE_SECRET_KEY,
        StripeUtils.stripeOptions(c.env.STRIPE_API_URL),
      )
      const paymentMethods = await StripeUtils.listCardPaymentMethods(
        stripe,
        billing.stripe_customer_id,
      )
      const defaultPaymentMethod = StripeUtils.getDefaultPaymentMethod(
        billing.default_payment_method_id,
        paymentMethods,
      )
      if (defaultPaymentMethod?.id !== billing.default_payment_method_id)
        await c.var.db
          .updateTable(entityType)
          .set({ default_payment_method_id: defaultPaymentMethod?.id ?? null })
          .where('id', '=', entityId)
          .execute()
      const card = defaultPaymentMethod?.card
      if (card) method = { brand: card.brand, last4: card.last4 }
    }

    return c.json({ balance_mills: billing.balance_mills, payment_method: method }, 200)
  })
  .post(
    '/api/credits/add',
    hono.validator(
      'json',
      z.object({
        amount: z.enum(Constants.creditAmounts),
        locked: z.boolean().optional(),
        organization_id: z.string().optional(),
        save: z.boolean().optional(),
      }),
    ),
    async (c) => {
      if (hono.narrowValidation) return hono.validationError(c)
      if (!c.var.session)
        return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

      const json = c.req.valid('json')
      const amount = Number(json.amount)

      const entityType = json.organization_id ? 'organization' : 'account'
      const entityId = json.organization_id ?? c.var.session.account_id

      if (json.organization_id) {
        const member = await c.var.db
          .selectFrom('organization_member')
          .where('organization_id', '=', json.organization_id)
          .where('account_id', '=', c.var.session.account_id)
          .select('role')
          .executeTakeFirst()
        if (!member || (member.role !== 'owner' && member.role !== 'admin'))
          return c.json(
            { code: 'organization_access_denied', message: 'Organization access denied' },
            403,
          )
      }

      const rateLimit = await hono.rateLimit(c.env.KV, c.executionCtx, {
        ip: entityId,
        key: `credits_add:${entityType}`,
        max: 10,
        window: 3600, // 1 hour
      })
      if (rateLimit.error)
        return c.json(
          { code: 'rate_limit_exceeded' as const, message: 'Rate limit exceeded' },
          429,
          {
            'retry-after': String(rateLimit.reset - Math.floor(Date.now() / 1000)),
          },
        )

      const billing = await c.var.db
        .selectFrom(entityType)
        .where('id', '=', entityId)
        .select('stripe_customer_id')
        .executeTakeFirst()
      if (!billing) return c.json({ code: 'not_found' as const, message: 'Not found' }, 404)

      const stripe = new Stripe(
        c.env.STRIPE_SECRET_KEY,
        StripeUtils.stripeOptions(c.env.STRIPE_API_URL),
      )

      let stripeCustomerId = billing.stripe_customer_id

      // Create Stripe customer lazily
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          metadata: { entity_type: entityType, entity_id: entityId },
        })
        const result = await c.var.db
          .updateTable(entityType)
          .set({ stripe_customer_id: customer.id })
          .where('id', '=', entityId)
          .where('stripe_customer_id', 'is', null)
          .returning('stripe_customer_id')
          .executeTakeFirst()
        if (result?.stripe_customer_id) {
          stripeCustomerId = result.stripe_customer_id
        } else {
          // Another request won the race (use existing customer)
          const existing = await c.var.db
            .selectFrom(entityType)
            .where('id', '=', entityId)
            .select('stripe_customer_id')
            .executeTakeFirstOrThrow()
          stripeCustomerId = existing.stripe_customer_id
          // Clean up orphaned Stripe customer
          await stripe.customers.del(customer.id)
        }
      }

      if (!stripeCustomerId)
        return c.json({ code: 'not_found' as const, message: 'Not found' }, 404)
      const savedPaymentMethods = await StripeUtils.listCardPaymentMethods(
        stripe,
        stripeCustomerId,
        Constants.maxSavedPaymentMethods + 1,
      )
      const canSavePaymentMethod = savedPaymentMethods.length < Constants.maxSavedPaymentMethods

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        customer: stripeCustomerId,
        metadata: { entity_type: entityType, entity_id: entityId },
        ...(json.save && canSavePaymentMethod ? { setup_future_usage: 'off_session' } : {}),
      })
      const paymentIntentSecret = StripeUtils.getPaymentIntentSecret(
        paymentIntent,
        c.env.STRIPE_API_URL,
      )
      if (!paymentIntentSecret)
        return c.json({ code: 'payment_failed' as const, message: 'Payment failed' }, 400)

      let csSecret: string | null = null
      let savedPaymentMethodsUnavailable = false
      try {
        const customerSession = await StripeUtils.createPaymentElementCustomerSession(
          stripe,
          stripeCustomerId,
          canSavePaymentMethod,
        )
        csSecret = customerSession.client_secret
      } catch (error) {
        Sentry.captureException(error)
        savedPaymentMethodsUnavailable = savedPaymentMethods.length > 0
      }

      const paymentId = Nanoid.generate()
      await c.env.KV.put(
        `payment:${paymentId}`,
        JSON.stringify({
          amount,
          cs_secret: csSecret,
          has_saved_payment_methods: savedPaymentMethods.length > 0,
          locked: json.locked ?? false,
          pi_secret: paymentIntentSecret,
          saved_payment_methods_unavailable: savedPaymentMethodsUnavailable,
        }),
        { expirationTtl: 1800 },
      )

      return c.json(
        {
          url: `https://${c.env.HOST}/credits/add/${paymentId}`,
          payment_id: paymentId,
        },
        200,
      )
    },
  )
  .post(
    '/api/credits/charge',
    hono.validator(
      'json',
      z.object({
        amount: z.enum(Constants.creditAmounts),
        organization_id: z.string().optional(),
      }),
    ),
    async (c) => {
      if (hono.narrowValidation) return hono.validationError(c)
      if (!c.var.session)
        return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

      const json = c.req.valid('json')
      const amount = Number(json.amount)

      const entityType = json.organization_id ? 'organization' : 'account'
      const entityId = json.organization_id ?? c.var.session.account_id

      if (json.organization_id) {
        const member = await c.var.db
          .selectFrom('organization_member')
          .where('organization_id', '=', json.organization_id)
          .where('account_id', '=', c.var.session.account_id)
          .select('role')
          .executeTakeFirst()
        if (!member || (member.role !== 'owner' && member.role !== 'admin'))
          return c.json(
            { code: 'organization_access_denied', message: 'Organization access denied' },
            403,
          )
      }

      const billing = await c.var.db
        .selectFrom(entityType)
        .where('id', '=', entityId)
        .select(['default_payment_method_id', 'stripe_customer_id'])
        .executeTakeFirst()
      if (!billing) return c.json({ code: 'not_found' as const, message: 'Not found' }, 404)

      const stripeCustomerId = billing.stripe_customer_id
      if (!stripeCustomerId)
        return c.json(
          { code: 'no_payment_method' as const, message: 'No payment method on file' },
          400,
        )

      const stripe = new Stripe(
        c.env.STRIPE_SECRET_KEY,
        StripeUtils.stripeOptions(c.env.STRIPE_API_URL),
      )

      const paymentMethods = await StripeUtils.listCardPaymentMethods(stripe, stripeCustomerId)
      const defaultPaymentMethod = StripeUtils.getDefaultPaymentMethod(
        billing.default_payment_method_id,
        paymentMethods,
      )
      if (!defaultPaymentMethod)
        return c.json(
          { code: 'no_payment_method' as const, message: 'No payment method on file' },
          400,
        )
      if (defaultPaymentMethod.id !== billing.default_payment_method_id)
        await c.var.db
          .updateTable(entityType)
          .set({ default_payment_method_id: defaultPaymentMethod.id })
          .where('id', '=', entityId)
          .execute()

      const rateLimit = await hono.rateLimit(c.env.KV, c.executionCtx, {
        ip: entityId,
        key: `credits_charge:${entityType}`,
        max: 10,
        window: 3600, // 1 hour
      })
      if (rateLimit.error)
        return c.json(
          { code: 'rate_limit_exceeded' as const, message: 'Rate limit exceeded' },
          429,
          {
            'retry-after': String(rateLimit.reset - Math.floor(Date.now() / 1000)),
          },
        )

      const createRequiresActionResponse = async (paymentIntent: Stripe.PaymentIntent) => {
        const paymentIntentSecret = StripeUtils.getPaymentIntentSecret(
          paymentIntent,
          c.env.STRIPE_API_URL,
        )
        if (!paymentIntentSecret)
          return c.json({ code: 'payment_failed' as const, message: 'Payment failed' }, 400)

        // Only enable saving in the Payment Element when the customer is still below our cap.
        const canSavePaymentMethod =
          (await StripeUtils.getSavedPaymentMethodCount(stripe, stripeCustomerId)) <
          Constants.maxSavedPaymentMethods
        const customerSession = await StripeUtils.createPaymentElementCustomerSession(
          stripe,
          stripeCustomerId,
          canSavePaymentMethod,
        )

        const paymentId = Nanoid.generate()
        await c.env.KV.put(
          `payment:${paymentId}`,
          JSON.stringify({
            amount,
            cs_secret: customerSession.client_secret,
            locked: true,
            pi_secret: paymentIntentSecret,
          }),
          { expirationTtl: 1800 },
        )

        return c.json(
          {
            payment_id: paymentId,
            status: 'requires_action' as const,
            url: `https://${c.env.HOST}/credits/add/${paymentId}`,
          },
          200,
        )
      }

      let paymentIntent: Stripe.PaymentIntent
      try {
        const idempotencyKey = c.req.header('idempotency-key')
        paymentIntent = await stripe.paymentIntents.create(
          {
            amount,
            confirm: true,
            currency: 'usd',
            customer: stripeCustomerId,
            metadata: { entity_type: entityType, entity_id: entityId },
            off_session: true,
            payment_method: defaultPaymentMethod.id,
          },
          idempotencyKey ? { idempotencyKey } : undefined,
        )
      } catch (error) {
        if (
          error instanceof Stripe.errors.StripeCardError &&
          error.code === 'authentication_required' &&
          error.payment_intent
        )
          return createRequiresActionResponse(error.payment_intent)

        if (error instanceof Stripe.errors.StripeError)
          return c.json(
            {
              code: 'payment_failed',
              // Stripe's generic message is vague here; show a clearer recovery path.
              message:
                error instanceof Stripe.errors.StripeCardError &&
                error.decline_code === 'fraudulent'
                  ? 'Your card was declined as fraudulent. Try a different payment method.'
                  : error.message,
            },
            400,
          )
        throw error
      }

      if (paymentIntent.status === 'succeeded')
        return c.json({ payment_id: paymentIntent.id, status: 'succeeded' } as const, 200)

      if (paymentIntent.status === 'requires_action')
        return createRequiresActionResponse(paymentIntent)

      return c.json({ code: 'payment_failed' as const, message: 'Payment failed' }, 400)
    },
  )
  .get('/api/health', (c) => c.json({ ok: true }, 200))
  .get('/api/invites/:token', async (c) => {
    const invite = await c.var.db
      .selectFrom('organization_invite')
      .innerJoin('organization', 'organization.id', 'organization_invite.organization_id')
      .where('organization_invite.token', '=', c.req.param('token'))
      .where('organization_invite.deleted_at', 'is', null)
      .where('organization_invite.expires_at', '>', new Date())
      .where((eb) =>
        eb.or([
          eb('organization_invite.max_uses', 'is', null),
          eb('organization_invite.use_count', '<', eb.ref('organization_invite.max_uses')),
        ]),
      )
      .select(['organization.login', 'organization.name', 'organization_invite.role'])
      .executeTakeFirst()

    if (!invite) return c.json({ code: 'not_found' as const, message: 'Invite not found' }, 404)
    return c.json(
      {
        invite: {
          organization: { login: invite.login, name: invite.name },
          role: invite.role,
        },
      },
      200,
    )
  })
  .post('/api/invites/:token/accept', async (c) => {
    if (!c.var.session)
      return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

    // Atomically claim a use slot — prevents racing past max_uses
    const invite = await c.var.db
      .updateTable('organization_invite')
      .set({ use_count: sql`use_count + 1` })
      .where('token', '=', c.req.param('token'))
      .where('deleted_at', 'is', null)
      .where('expires_at', '>', new Date())
      .where((eb) => eb.or([eb('max_uses', 'is', null), eb('use_count', '<', eb.ref('max_uses'))]))
      .returning(['organization_id', 'role'])
      .executeTakeFirst()
    if (!invite) return c.json({ code: 'not_found' as const, message: 'Invite not found' }, 404)

    const inserted = await c.var.db
      .insertInto('organization_member')
      .values({
        account_id: c.var.session.account_id,
        organization_id: invite.organization_id,
        role: invite.role,
      })
      .onConflict((oc) => oc.columns(['organization_id', 'account_id']).doNothing())
      .returning('id')
      .executeTakeFirst()
    if (!inserted) {
      // Roll back the use_count since the user was already a member
      await c.var.db
        .updateTable('organization_invite')
        .set({ use_count: sql`use_count - 1` })
        .where('token', '=', c.req.param('token'))
        .execute()
      return c.json(
        { code: 'already_member', message: 'Already a member of this organization' },
        409,
      )
    }

    const organization = await c.var.db
      .selectFrom('organization')
      .where('id', '=', invite.organization_id)
      .select(['id', 'login'])
      .executeTakeFirstOrThrow()

    return c.json({ organization }, 200)
  })
  .get('/api/og.png', hono.validator('query', Og.schema), async (c) => {
    if (hono.narrowValidation) return hono.validationError(c)

    const rateLimit = await hono.rateLimit(c.env.KV, c.executionCtx, {
      ip: c.req.header('cf-connecting-ip') ?? 'unknown',
      key: 'og',
      max: import.meta.env.DEV ? 60 : 30,
      window: 60,
    })
    if (rateLimit.error)
      return c.json({ code: 'rate_limit_exceeded' as const, message: 'Rate limit exceeded' }, 429, {
        'retry-after': String(rateLimit.reset - Math.floor(Date.now() / 1000)),
      })

    const query = c.req.valid('query')
    try {
      return await Og.render(c.req.raw, c.env, c.var.db, query)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ code: 'og_generation_failed' as const, message }, 500)
    }
  })
  .get('/api/orgs', async (c) => {
    if (!c.var.session)
      return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

    const organizations = await c.var.db
      .selectFrom('organization_member')
      .innerJoin('organization', 'organization.id', 'organization_member.organization_id')
      .where('organization_member.account_id', '=', c.var.session.account_id)
      .where('organization.deleted_at', 'is', null)
      .select([
        'organization.created_at',
        'organization.id',
        'organization.login',
        'organization.name',
        'organization_member.role',
      ])
      .execute()

    return c.json({ organizations }, 200)
  })
  .get('/api/orgs/:id', async (c) => {
    if (!c.var.session)
      return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

    const organization = await c.var.db
      .selectFrom('organization')
      .innerJoin('organization_member', 'organization_member.organization_id', 'organization.id')
      .where('organization.id', '=', c.req.param('id'))
      .where('organization_member.account_id', '=', c.var.session.account_id)
      .where('organization.deleted_at', 'is', null)
      .select([
        'organization.id',
        'organization.login',
        'organization.name',
        'organization_member.role',
      ])
      .executeTakeFirst()

    if (!organization) return c.json({ code: 'not_found' as const, message: 'Not found' }, 404)
    return c.json({ organization }, 200)
  })
  .post(
    '/api/orgs',
    hono.validator(
      'json',
      z.object({
        login: z
          .string()
          .min(2)
          .max(50)
          .regex(
            /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
            'Must start and end with a lowercase letter or number, and contain only lowercase letters, numbers, or hyphens',
          ),
        name: z.string().min(2).max(50).optional(),
      }),
    ),
    async (c) => {
      if (hono.narrowValidation) return hono.validationError(c)
      if (!c.var.session)
        return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

      const rateLimit = await hono.rateLimit(c.env.KV, c.executionCtx, {
        ip: c.var.session.account_id,
        key: 'org_create',
        max: 3,
        window: 3600, // 1 hour
      })
      if (rateLimit.error)
        return c.json(
          { code: 'rate_limit_exceeded' as const, message: 'Rate limit exceeded' },
          429,
          {
            'retry-after': String(rateLimit.reset - Math.floor(Date.now() / 1000)),
          },
        )

      const json = c.req.valid('json')
      if (Constants.reservedLogins.has(json.login))
        return c.json({ code: 'login_reserved' as const, message: 'Login is reserved' }, 409)

      const existingLogin = await c.var.db
        .selectFrom((eb) =>
          eb
            .selectFrom('account')
            .select('id')
            .where('login', '=', json.login)
            .unionAll(eb.selectFrom('organization').select('id').where('login', '=', json.login))
            .as('existing'),
        )
        .select('id')
        .limit(1)
        .executeTakeFirst()
      if (existingLogin)
        return c.json({ code: 'login_taken' as const, message: 'Login is already taken' }, 409)

      const accountId = c.var.session.account_id
      try {
        await c.var.db.transaction().execute(async (tx) => {
          const org = await tx
            .insertInto('organization')
            .values({ name: json.name ?? json.login, login: json.login })
            .returning('id')
            .executeTakeFirstOrThrow()
          await tx
            .insertInto('organization_member')
            .values({
              account_id: accountId,
              organization_id: org.id,
              role: 'owner',
            })
            .execute()
        })
      } catch {
        return c.json({ code: 'login_taken' as const, message: 'Login is already taken' }, 409)
      }

      return c.json({ login: json.login }, 200)
    },
  )
  .post(
    '/api/orgs/:id/invites',
    hono.validator(
      'json',
      z.object({
        expires_in: z.number().int().positive().optional(),
        max_uses: z.number().int().positive().nullable().default(null),
        role: DbSchema.organization_invite.shape.role
          .extract(['admin', 'member'])
          .default('member'),
      }),
    ),
    async (c) => {
      if (hono.narrowValidation) return hono.validationError(c)
      if (!c.var.session)
        return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

      const rateLimit = await hono.rateLimit(c.env.KV, c.executionCtx, {
        ip: c.var.session.account_id,
        key: `org_invite:${c.req.param('id')}`,
        max: 20,
        window: 3600, // 1 hour
      })
      if (rateLimit.error)
        return c.json(
          { code: 'rate_limit_exceeded' as const, message: 'Rate limit exceeded' },
          429,
          {
            'retry-after': String(rateLimit.reset - Math.floor(Date.now() / 1000)),
          },
        )

      const member = await c.var.db
        .selectFrom('organization_member')
        .where('organization_id', '=', c.req.param('id'))
        .where('account_id', '=', c.var.session.account_id)
        .where('role', 'in', ['owner', 'admin'])
        .select(['id', 'role'])
        .executeTakeFirst()
      if (!member)
        return c.json({ code: 'forbidden' as const, message: 'Insufficient permissions' }, 403)

      const json = c.req.valid('json')
      if (member.role === 'admin' && json.role === 'admin')
        return c.json({ code: 'forbidden' as const, message: 'Insufficient permissions' }, 403)
      const token = customAlphabet(Nanoid.alphabet, 32)()
      const expires_at = new Date(Date.now() + (json.expires_in ?? 604800) * 1000)

      await c.var.db
        .insertInto('organization_invite')
        .values({
          created_by: c.var.session.account_id,
          expires_at,
          max_uses: json.max_uses,
          organization_id: c.req.param('id'),
          role: json.role,
          token,
        })
        .execute()

      return c.json(
        {
          invite: {
            expires_at: expires_at.toISOString(),
            max_uses: json.max_uses,
            role: json.role,
            token,
            url: `https://${c.env.HOST}/invite/${token}`,
          },
        },
        201,
      )
    },
  )
  .get('/api/orgs/:id/invites', async (c) => {
    if (!c.var.session)
      return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

    const member = await c.var.db
      .selectFrom('organization_member')
      .where('organization_id', '=', c.req.param('id'))
      .where('account_id', '=', c.var.session.account_id)
      .where('role', 'in', ['owner', 'admin'])
      .select('id')
      .executeTakeFirst()
    if (!member)
      return c.json({ code: 'forbidden' as const, message: 'Insufficient permissions' }, 403)

    const invites = await c.var.db
      .selectFrom('organization_invite')
      .where('organization_id', '=', c.req.param('id'))
      .where('deleted_at', 'is', null)
      .select(['created_at', 'expires_at', 'id', 'max_uses', 'role', 'token', 'use_count'])
      .orderBy('created_at', 'desc')
      .execute()

    return c.json({ invites }, 200)
  })
  .delete('/api/orgs/:id/invites/:inviteId', async (c) => {
    if (!c.var.session)
      return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

    const member = await c.var.db
      .selectFrom('organization_member')
      .where('organization_id', '=', c.req.param('id'))
      .where('account_id', '=', c.var.session.account_id)
      .where('role', 'in', ['owner', 'admin'])
      .select('id')
      .executeTakeFirst()
    if (!member)
      return c.json({ code: 'forbidden' as const, message: 'Insufficient permissions' }, 403)

    const result = await c.var.db
      .updateTable('organization_invite')
      .set({ deleted_at: new Date() })
      .where('id', '=', c.req.param('inviteId'))
      .where('organization_id', '=', c.req.param('id'))
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (!result.numUpdatedRows)
      return c.json({ code: 'not_found' as const, message: 'Not found' }, 404)
    return c.json({ ok: true }, 200)
  })
  .get('/api/orgs/:id/members', async (c) => {
    if (!c.var.session)
      return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

    const member = await c.var.db
      .selectFrom('organization_member')
      .where('organization_id', '=', c.req.param('id'))
      .where('account_id', '=', c.var.session.account_id)
      .where('role', 'in', ['owner', 'admin'])
      .select('id')
      .executeTakeFirst()
    if (!member)
      return c.json({ code: 'forbidden' as const, message: 'Insufficient permissions' }, 403)

    const members = await c.var.db
      .selectFrom('organization_member')
      .where('organization_member.organization_id', '=', c.req.param('id'))
      .innerJoin('account', 'account.id', 'organization_member.account_id')
      .select([
        'organization_member.id',
        'organization_member.role',
        'organization_member.created_at',
        'account.login',
        'account.name',
        'account.email',
      ])
      .orderBy('organization_member.created_at', 'asc')
      .execute()

    return c.json({ members }, 200)
  })
  .post(
    '/api/orgs/:id/members',
    hono.validator(
      'json',
      z.object({
        login: z.string(),
        role: DbSchema.organization_invite.shape.role
          .extract(['admin', 'member'])
          .default('member'),
      }),
    ),
    async (c) => {
      if (hono.narrowValidation) return hono.validationError(c)
      if (!c.var.session)
        return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

      const rateLimit = await hono.rateLimit(c.env.KV, c.executionCtx, {
        ip: c.var.session.account_id,
        key: `org_member_add:${c.req.param('id')}`,
        max: 50,
        window: 3600, // 1 hour
      })
      if (rateLimit.error)
        return c.json(
          { code: 'rate_limit_exceeded' as const, message: 'Rate limit exceeded' },
          429,
          {
            'retry-after': String(rateLimit.reset - Math.floor(Date.now() / 1000)),
          },
        )

      const currentMember = await c.var.db
        .selectFrom('organization_member')
        .where('organization_id', '=', c.req.param('id'))
        .where('account_id', '=', c.var.session.account_id)
        .where('role', 'in', ['owner', 'admin'])
        .select('role')
        .executeTakeFirst()
      if (!currentMember)
        return c.json({ code: 'forbidden' as const, message: 'Insufficient permissions' }, 403)

      const json = c.req.valid('json')
      if (currentMember.role === 'admin' && json.role === 'admin')
        return c.json({ code: 'forbidden' as const, message: 'Insufficient permissions' }, 403)

      const account = await c.var.db
        .selectFrom('account')
        .where('login', '=', json.login)
        .where('deleted_at', 'is', null)
        .select('id')
        .executeTakeFirst()
      if (!account)
        return c.json({ code: 'account_not_found' as const, message: 'Account not found' }, 404)

      const member = await c.var.db
        .insertInto('organization_member')
        .values({
          account_id: account.id,
          organization_id: c.req.param('id'),
          role: json.role,
        })
        .onConflict((oc) => oc.columns(['organization_id', 'account_id']).doNothing())
        .returning('id')
        .executeTakeFirst()
      if (!member)
        return c.json(
          { code: 'already_member', message: 'Already a member of this organization' },
          409,
        )

      return c.json({ member: { id: member.id, login: json.login, role: json.role } }, 201)
    },
  )
  .patch(
    '/api/orgs/:id/members/:memberId',
    hono.validator(
      'json',
      z.object({ role: DbSchema.organization_invite.shape.role.extract(['admin', 'member']) }),
    ),
    async (c) => {
      if (hono.narrowValidation) return hono.validationError(c)
      if (!c.var.session)
        return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

      const currentMember = await c.var.db
        .selectFrom('organization_member')
        .where('organization_id', '=', c.req.param('id'))
        .where('account_id', '=', c.var.session.account_id)
        .where('role', 'in', ['owner', 'admin'])
        .select(['id', 'role'])
        .executeTakeFirst()
      if (!currentMember)
        return c.json({ code: 'forbidden' as const, message: 'Insufficient permissions' }, 403)
      if (currentMember.id === c.req.param('memberId'))
        return c.json({ code: 'forbidden' as const, message: 'Insufficient permissions' }, 403)

      const member = await c.var.db
        .selectFrom('organization_member')
        .where('id', '=', c.req.param('memberId'))
        .where('organization_id', '=', c.req.param('id'))
        .select('role')
        .executeTakeFirst()
      if (!member) return c.json({ code: 'not_found' as const, message: 'Member not found' }, 404)
      if (member.role === 'owner')
        return c.json(
          { code: 'cannot_change_owner' as const, message: 'Cannot change owner role' },
          403,
        )

      const json = c.req.valid('json')
      await c.var.db
        .updateTable('organization_member')
        .set({ role: json.role })
        .where('id', '=', c.req.param('memberId'))
        .where('organization_id', '=', c.req.param('id'))
        .execute()

      return c.json({ ok: true }, 200)
    },
  )
  .delete('/api/orgs/:id/members/:memberId', async (c) => {
    if (!c.var.session)
      return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

    const currentMember = await c.var.db
      .selectFrom('organization_member')
      .where('organization_id', '=', c.req.param('id'))
      .where('account_id', '=', c.var.session.account_id)
      .where('role', 'in', ['owner', 'admin'])
      .select(['id', 'role'])
      .executeTakeFirst()
    if (!currentMember)
      return c.json({ code: 'forbidden' as const, message: 'Insufficient permissions' }, 403)
    if (currentMember.id === c.req.param('memberId'))
      return c.json({ code: 'cannot_remove_self' as const, message: 'Cannot remove yourself' }, 403)

    const member = await c.var.db
      .selectFrom('organization_member')
      .where('id', '=', c.req.param('memberId'))
      .where('organization_id', '=', c.req.param('id'))
      .select('role')
      .executeTakeFirst()
    if (!member) return c.json({ code: 'not_found' as const, message: 'Member not found' }, 404)
    if (member.role === 'owner')
      return c.json({ code: 'cannot_remove_owner' as const, message: 'Cannot remove owner' }, 403)

    await c.var.db
      .deleteFrom('organization_member')
      .where('id', '=', c.req.param('memberId'))
      .where('organization_id', '=', c.req.param('id'))
      .execute()

    return c.json({ ok: true }, 200)
  })
  .post(
    '/api/tokens',
    hono.validator('json', z.object({ name: z.string().min(1).max(255) })),
    async (c) => {
      if (hono.narrowValidation) return hono.validationError(c)
      if (!c.var.session)
        return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)
      if (c.var.api_key_id)
        return c.json(
          { code: 'forbidden', message: 'Cannot create tokens with API token auth' },
          403,
        )

      const rateLimit = await hono.rateLimit(c.env.KV, c.executionCtx, {
        ip: c.var.session.account_id,
        key: `token_create:${c.var.organization_id ?? 'account'}`,
        max: 25,
        window: 3600, // 1 hour
      })
      if (rateLimit.error)
        return c.json(
          { code: 'rate_limit_exceeded' as const, message: 'Rate limit exceeded' },
          429,
          {
            'retry-after': String(rateLimit.reset - Math.floor(Date.now() / 1000)),
          },
        )

      const json = c.req.valid('json')

      const existing = await c.var.db
        .selectFrom('api_key')
        .where('account_id', '=', c.var.session.account_id)
        .where('organization_id', c.var.organization_id ? '=' : 'is', c.var.organization_id ?? null)
        .where('name', '=', json.name)
        .where('deleted_at', 'is', null)
        .select('id')
        .executeTakeFirst()
      if (existing)
        return c.json({ code: 'name_taken' as const, message: 'Token name already taken' }, 409)

      const token = ApiKey.generate()
      const keyHash = await ApiKey.hash(token)
      const keyPrefix = token.slice(0, 14)

      const row = await c.var.db
        .insertInto('api_key')
        .values({
          account_id: c.var.session.account_id,
          organization_id: c.var.organization_id,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          name: json.name,
        })
        .returning(['id', 'name', 'key_prefix', 'organization_id', 'created_at'])
        .executeTakeFirstOrThrow()

      return c.json({ api_key: { ...row, token } }, 201)
    },
  )
  .get('/api/tokens', async (c) => {
    if (!c.var.session)
      return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

    const api_keys = await c.var.db
      .selectFrom('api_key')
      .where('account_id', '=', c.var.session.account_id)
      .where('organization_id', c.var.organization_id ? '=' : 'is', c.var.organization_id)
      .where('deleted_at', 'is', null)
      .select(['id', 'name', 'key_prefix', 'organization_id', 'last_used_at', 'created_at'])
      .orderBy('created_at', 'desc')
      .execute()

    return c.json({ api_keys }, 200)
  })
  .delete('/api/tokens/:id', async (c) => {
    if (!c.var.session)
      return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

    const result = await c.var.db
      .updateTable('api_key')
      .set({ deleted_at: new Date() })
      .where('id', '=', c.req.param('id'))
      .where('account_id', '=', c.var.session.account_id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (!result.numUpdatedRows)
      return c.json({ code: 'not_found' as const, message: 'Token not found' }, 404)
    return c.json({ ok: true }, 200)
  })
  .post('/api/stripe/webhook', async (c) => {
    const body = await c.req.text()
    const signature = c.req.header('stripe-signature')
    if (!signature)
      return c.json({ code: 'missing_signature' as const, message: 'Missing signature' }, 400)

    const stripe = new Stripe(
      c.env.STRIPE_SECRET_KEY,
      StripeUtils.stripeOptions(c.env.STRIPE_API_URL),
    )

    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        c.env.STRIPE_WEBHOOK_SECRET,
      )
    } catch (error) {
      Sentry.captureException(error)
      return c.json({ code: 'invalid_signature' as const, message: 'Invalid signature' }, 400)
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object
        const customer = typeof paymentIntent.customer === 'string' ? paymentIntent.customer : null
        if (customer && paymentIntent.amount)
          await c.env.STRIPE_WEBHOOK_QUEUE.send({
            type: event.type,
            data: {
              amount_total: paymentIntent.amount,
              customer,
              id: paymentIntent.id,
            },
          })
        break
      }
      case 'charge.dispute.created': {
        // TODO: send chargeback alert (email/Slack)
        const dispute = event.data.object
        const charge =
          typeof dispute.charge === 'string'
            ? await stripe.charges.retrieve(dispute.charge)
            : dispute.charge
        const customer = typeof charge.customer === 'string' ? charge.customer : null
        if (customer)
          await c.env.STRIPE_WEBHOOK_QUEUE.send({
            type: event.type,
            data: {
              amount_total: dispute.amount,
              customer,
              id: dispute.id,
            },
          })
        break
      }
      case 'refund.created': {
        const refund = event.data.object
        const charge =
          typeof refund.charge === 'string'
            ? await stripe.charges.retrieve(refund.charge)
            : refund.charge
        const customer = charge && typeof charge.customer === 'string' ? charge.customer : null
        if (customer)
          await c.env.STRIPE_WEBHOOK_QUEUE.send({
            type: 'refund.created',
            data: {
              amount_total: refund.amount,
              customer,
              id: refund.id,
            },
          })
        break
      }
    }

    return c.json({ received: true }, 200)
  })
  .get(
    '/api/requests',
    hono.validator(
      'query',
      z.object({
        limit: z.coerce.number().int().positive().default(20),
        page: z.coerce.number().int().positive().default(1),
        search: z.string().optional(),
      }),
    ),
    async (c) => {
      if (hono.narrowValidation) return hono.validationError(c)
      if (!c.var.session)
        return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

      const query = c.req.valid('query')
      const entityId = c.var.organization_id ?? c.var.session.account_id
      const ownerColumn = c.var.organization_id ? 'organization_id' : 'account_id'
      const baseQuery = c.var.db.selectFrom('request').where(ownerColumn, '=', entityId)
      const filteredQuery = query.search
        ? baseQuery.where('url', 'ilike', `%${query.search}%`)
        : baseQuery
      const offset = (query.page - 1) * query.limit

      const [countResult, requests] = await Promise.all([
        filteredQuery
          .select((eb) => eb.fn.countAll<number>().as('total'))
          .executeTakeFirstOrThrow(),
        filteredQuery
          .select(['id', 'url', 'created_at', 'cached', 'objective', 'keywords'])
          .select(requestTokensSavedSql().as('tokens_saved'))
          .orderBy('created_at', 'desc')
          .orderBy('id', 'desc')
          .offset(offset)
          .limit(query.limit)
          .execute(),
      ])

      return c.json(
        {
          requests: requests.map((request) => ({
            cached: request.cached,
            created_at: request.created_at.toISOString(),
            id: request.id,
            keywords: request.keywords,
            objective: request.objective,
            tokens_saved: Number(request.tokens_saved),
            url: request.url,
          })),
          total: Number(countResult.total),
        },
        200,
      )
    },
  )
  .get('/api/requests/:id', async (c) => {
    if (!c.var.session)
      return c.json({ code: 'unauthorized' as const, message: 'Authentication required' }, 401)

    const entityId = c.var.organization_id ?? c.var.session.account_id
    const ownerColumn = c.var.organization_id ? 'organization_id' : 'account_id'
    const request = await c.var.db
      .selectFrom('request')
      .where(ownerColumn, '=', entityId)
      .where('id', '=', c.req.param('id'))
      .select([
        'id',
        'url',
        'created_at',
        'cached',
        'objective',
        'keywords',
        'mode',
        'hostname',
        'path',
        'source_tokens',
        'source_tokens_method',
        'markdown_tokens',
        'filtered_tokens',
        'extracted_tokens',
      ])
      .select(requestTokensSavedSql().as('tokens_saved'))
      .executeTakeFirst()

    if (!request) return c.json({ code: 'not_found' as const, message: 'Not found' }, 404)

    return c.json(
      {
        request: {
          cached: request.cached,
          created_at: request.created_at.toISOString(),
          extracted_tokens: request.extracted_tokens,
          filtered_tokens: request.filtered_tokens,
          hostname: request.hostname,
          id: request.id,
          keywords: request.keywords,
          markdown_tokens: request.markdown_tokens,
          mode: request.mode,
          objective: request.objective,
          path: request.path,
          source_tokens: request.source_tokens,
          source_tokens_method: request.source_tokens_method,
          tokens_saved: Number(request.tokens_saved),
          url: request.url,
        },
      },
      200,
    )
  })
  .post('/api/tunnel', async (c) => {
    const body = await c.req.arrayBuffer()
    if (!new Uint8Array(body).includes(10))
      return c.json({ code: 'invalid_envelope' as const, message: 'Invalid envelope' }, 400)
    const dsn = new URL(c.env.SENTRY_DSN)
    const project = dsn.pathname.replace(/^\//, '')
    const res = await fetch(`https://${dsn.hostname}/api/${project}/envelope/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body,
    })
    if (!res.ok)
      return c.json(
        { code: 'sentry_upstream_error' as const, message: 'Sentry upstream error' },
        502,
      )
    return c.json({ ok: true }, 200)
  })
  .get(
    '/api/:url{.+}',
    hono.validator(
      'param',
      z.object({
        url: z
          .string()
          .transform((arg) => (arg.includes('://') ? arg : `https://${arg}`))
          .pipe(
            z.url({
              hostname: z.regexes.domain,
              normalize: true,
              protocol: /^https?$/,
            }),
          )
          .refine(
            (url) =>
              // Extra protection from common bot probe requests (keep in sync with scripts/deployWaf.ts)
              !/\.(action|aspx?|cgi|css|eot|gif|ico|jpe?g|json|jsx?|map|php|png|svg|tsx?|ttf|webp|woff2?|xml|ya?ml)$/i.test(
                new URL(url).hostname,
              ),
          ),
      }),
    ),
    hono.validator(
      'query',
      (() => {
        const fresh = z
          .union([z.literal('').transform(() => true), z.coerce.boolean()])
          .optional()
          .default(false)
        const keywords = z
          .string()
          .transform((v) => v.split(/[\s,]+/).filter(Boolean))
          .optional()
        const mode = DbSchema.request.shape.mode.unwrap().default('smart')
        const objective = z.string().optional()
        return z
          .object({
            anchor: z.string().optional(),
            f: fresh,
            fresh,
            k: keywords,
            keywords,
            m: mode,
            mode,
            o: objective,
            objective,
            q: objective,
          })
          .transform((v) => ({
            anchor: (() => {
              if (!v.anchor) return undefined
              try {
                const decoded = decodeURIComponent(v.anchor).trim().replace(/^#+/, '')
                return decoded || undefined
              } catch {
                const trimmed = v.anchor.trim().replace(/^#+/, '')
                return trimmed || undefined
              }
            })(),
            fresh: v.fresh || v.f,
            keywords: v.keywords ?? v.k,
            mode: v.mode === 'smart' && v.m !== 'smart' ? v.m : v.mode,
            objective: v.objective ?? v.q ?? v.o,
          }))
      })(),
    ),
    async (c) => {
      if (hono.narrowValidation) return hono.validationError(c)
      if (hono.narrowValidation) return hono.invalidApiKey(c)
      const query = c.req.valid('query')
      const requestURL = new URL(c.req.valid('param').url)
      const url = new URL(requestURL)
      url.hash = ''

      const userAgent = c.req.header('user-agent')
      if (
        /Twitterbot|facebookexternalhit|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot/i.test(
          userAgent ?? '',
        )
      ) {
        const ogQuery = { page: 'url', url: url.toString() } satisfies Og.query
        const ogUrl = raw(
          new URL(
            `/api/og.png?${new URLSearchParams(ogQuery)}`,
            `https://${c.env.HOST}`,
          ).toString(),
        )
        return c.html(
          html`<meta property="og:title" content="${`${c.env.HOST}/${url}`}" />
<meta property="og:description" content="URL to markdown for agents" />
<meta property="og:image" content="${ogUrl}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${`https://${c.env.HOST}/${url}`}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${`${c.env.HOST}/${url}`}" />
<meta name="twitter:description" content="URL to markdown for agents" />
<meta name="twitter:image" content="${ogUrl}" />`,
          200,
        ) as never // casting to never so hono/client can infer c.json responses
      }

      if (c.req.header('x-organization-id') && !c.var.organization_id)
        return c.json(
          { code: 'organization_access_denied' as const, message: 'Organization access denied' },
          403,
        )

      const accept = accepts(c, {
        default: 'text/markdown',
        header: 'Accept',
        match(accepts) {
          const accept = accepts.find((accept) => {
            if (accept.q <= 0) return false
            const type = accept.type.toLowerCase()
            return type === '*/*' || type === 'application/json' || type === 'text/markdown'
          })
          if (!accept) return 'not_acceptable'
          if (accept.type === '*/*') return 'text/markdown'
          return accept.type.toLowerCase()
        },
        supports: ['application/json', 'text/markdown'],
      })
      if (accept === 'not_acceptable')
        return c.json({ code: 'not_acceptable' as const, message: 'Not Acceptable' }, 406, {
          vary: 'Accept',
        })

      const identity = c.var.session
        ? c.var.session.account_id
        : (c.req.header('cf-connecting-ip') ?? 'unknown')

      // Check balance for paid tier
      let billable = false
      if (c.var.session) {
        const billingEntityId = c.var.organization_id ?? c.var.session?.account_id
        const cached = await c.env.KV.get(`balance:${billingEntityId}`)
        const balanceMills = cached !== null ? Number(cached) : 0
        if (balanceMills > 0) billable = true
      }

      let rateLimitHeaders: Record<string, string> = {}
      if (!billable) {
        const limit = (() => {
          if (query.objective)
            return {
              key: `query:${identity}` as const,
              max: c.var.session ? 10 : 3,
              window: 3600,
            }
          return {
            key: `fetch:${identity}` as const,
            max: c.var.session ? 1000 : 100,
            window: 3600,
          }
        })()

        const kvKey = `ratelimit:${limit.key}` as const
        const now = Math.floor(Date.now() / 1000)
        const record = await c.env.KV.get(kvKey, 'json')

        const reset = record && record.reset > now ? record.reset : now + limit.window
        const count = record && record.reset > now ? record.count + 1 : 1

        rateLimitHeaders = {
          'x-ratelimit-limit': String(limit.max),
          'x-ratelimit-remaining': String(Math.max(0, limit.max - count)),
          'x-ratelimit-reset': String(reset),
        }

        if (count > limit.max)
          return c.json(
            {
              code: 'rate_limit_exceeded' as const,
              message: c.var.session ? 'Add credits to remove rate limits' : 'Rate limit exceeded',
            },
            429,
            {
              ...rateLimitHeaders,
              'retry-after': String(reset - now),
            },
          )

        c.executionCtx.waitUntil(
          c.env.KV.put(kvKey, JSON.stringify({ count, reset }), {
            expirationTtl: limit.window,
          }),
        )
      }

      const md = Md.create({
        headers: {
          'User-Agent': `Mozilla/5.0 (compatible; ${c.env.HOST}/1.0; +https://${c.env.HOST})`,
        },
        profiles: Md.profiles,
        rules: {
          ...Md.rules,
          [Md.rules.curlDocs.key]: Md.rules.curlDocs({
            fetch: (req, init) =>
              c.env.ASSETS.fetch(req instanceof Request ? req : new Request(req, init)),
          }),
          [Md.rules.curlMd.key]: Md.rules.curlMd({
            fetch: (req, init) =>
              c.env.ASSETS.fetch(req instanceof Request ? req : new Request(req, init)),
          }),
          ...Md.sites.github({
            token: c.var.session
              ? GitHub.resolveToken(c.var.db, c.var.session.account_id, c.env)
              : undefined,
          }),
        },
        transport: Md.transports.fallback([
          Md.transports.fetch(),
          Md.transports.cfBrowserRendering({
            accountId: c.env.CLOUDFLARE_ACCOUNT_ID,
            apiToken: c.env.CLOUDFLARE_API_TOKEN,
          }),
        ]),
      })

      let cached = false
      const response = await (async () => {
        const pageCacheKey = `page:${url.href}` as const
        const pageCached = await c.env.KV.get(pageCacheKey, 'json')
        if (!query.fresh && pageCached) {
          cached = true
          return { ...pageCached, ok: true as const, status: 200 }
        }
        const result = await md.fetch(url)
        if (!result.ok) return result
        c.executionCtx.waitUntil(
          c.env.KV.put(
            pageCacheKey,
            JSON.stringify({
              content: result.content,
              meta: result.meta,
              extras: result.extras,
            }),
            { expirationTtl: 900 }, // 15m
          ),
        )
        return result
      })()

      if (!response.ok && (response.status >= 500 || response.error))
        Sentry.captureException(
          new Error(response.error || `Upstream returned ${response.status} for ${url.href}`),
        )

      if (!response.ok)
        return c.json(
          {
            code: 'fetch_failed' as const,
            message: response.error || `Upstream returned ${response.status}`,
          },
          502,
        )

      const filteredContent = (() => {
        if (query.keywords && query.keywords.length > 0)
          return Md.filterSectionsByKeywords(response.content, query.keywords)
        return response.content
      })()

      const mode = Constants.modes[query.mode]
      let inputTokens = 0
      let completionTokens = 0
      let excerpt = filteredContent
      if (query.objective) {
        try {
          const result = await (async () => {
            const queryCacheKey =
              `query:${url.href}:${query.objective}:${query.keywords?.join(',') ?? ''}:${query.mode}` as const
            const queryCached = await c.env.KV.get(queryCacheKey)
            if (!query.fresh && queryCached) {
              cached = true
              return { completionTokens: 0, excerpt: queryCached, promptTokens: 0 }
            }

            const extractChunk = async (chunk: string) => {
              let lastError: unknown
              for (let attempt = 0; attempt < 2; attempt++) {
                try {
                  const output = z.parse(
                    z.object({
                      response: z.string().default(''),
                      usage: z
                        .object({
                          completion_tokens: z.number().default(0),
                          prompt_tokens: z.number().default(0),
                        })
                        .default({ completion_tokens: 0, prompt_tokens: 0 }),
                    }),
                    await c.env.AI.run(mode.model, {
                      max_tokens: 4096,
                      messages: [
                        { role: 'system', content: Constants.systemPrompt },
                        {
                          role: 'user',
                          content: `<page_content>\n${chunk}\n</page_content>\n\nObjective: ${query.objective}`,
                        },
                      ],
                    }),
                  )
                  return output
                } catch (error) {
                  lastError = error
                  if (
                    attempt === 1 ||
                    !(() => {
                      if (!(error instanceof Error)) return false
                      if (
                        error.name === 'InferenceUpstreamError' ||
                        error.name === 'AiInternalError'
                      )
                        return true

                      const normalized = error.message
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim()
                      return /\b504\b/.test(normalized) || /gateway time-?out/i.test(normalized)
                    })()
                  )
                    throw error
                }
              }

              throw lastError
            }

            const chunks = Md.chunk(filteredContent)
            const results: Awaited<ReturnType<typeof extractChunk>>[] = []
            let chunkIndex = 0
            // Bound Workers AI fan-out so one large objective request can't saturate inference capacity.
            await Promise.all(
              Array.from({ length: Math.min(2, chunks.length) }, async () => {
                while (chunkIndex < chunks.length) {
                  const currentIndex = chunkIndex
                  chunkIndex += 1
                  results[currentIndex] = await extractChunk(chunks[currentIndex]!)
                }
              }),
            )
            const filtered = results
              .filter((r) => r.response && r.response.trim() !== Constants.sentinelValue)
              .map((r) => r.response)
              .join('\n\n')
            const promptTokens = results.reduce((sum, r) => sum + r.usage.prompt_tokens, 0)
            const completionTokens = results.reduce((sum, r) => sum + r.usage.completion_tokens, 0)

            c.executionCtx.waitUntil(c.env.KV.put(queryCacheKey, filtered, { expirationTtl: 900 }))
            return { completionTokens, excerpt: filtered, promptTokens }
          })()
          inputTokens = result.promptTokens
          completionTokens = result.completionTokens
          excerpt = result.excerpt || filteredContent
        } catch (error) {
          const message = (() => {
            if (!(error instanceof Error)) return 'Unknown AI error'

            const message = error.message.replace(/^Error:\s*/i, '').trim()
            const code = message.match(/^error code:\s*(\d+)$/i)?.[1]
            if (code) {
              if (error.name === 'InferenceUpstreamError')
                return `Inference upstream error (${code})`
              if (error.name === 'AiInternalError') return `Workers AI internal error (${code})`
              return `AI error (${code})`
            }

            const title = message.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim()
            const text = message
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
            const normalized = title || text
            const status = normalized.match(/\b(502|503|504)\b/)?.[1]
            if (status === '504' || /gateway time-?out/i.test(normalized))
              return `Inference upstream timed out (${status ?? '504'})`
            if (status) return `Inference upstream error (${status})`
            return normalized || 'Unknown AI error'
          })()
          return c.json({ code: 'ai_failed' as const, message }, 502)
        }
      }

      const frontmatter = (() => {
        const yaml = yamlStringify(response.meta, { lineWidth: 0 }).trimEnd()
        return yaml ? `---\n${yaml}\n---` : undefined
      })()
      const markdownDocument = frontmatter
        ? `${frontmatter}\n\n${response.content}`
        : response.content
      const filteredDocument = (() => {
        if (!query.keywords?.length) return null
        if (frontmatter) return `${frontmatter}\n\n${filteredContent}`
        return filteredContent
      })()
      const extractedDocument = (() => {
        if (!query.objective) return null
        if (frontmatter) return `${frontmatter}\n\n${excerpt}`
        return excerpt
      })()
      const finalDocument = extractedDocument ?? filteredDocument ?? markdownDocument

      const markdownTokens = estimateTokenCount(markdownDocument)
      const filteredTokens = filteredDocument ? estimateTokenCount(filteredDocument) : null
      const extractedTokens = extractedDocument ? estimateTokenCount(extractedDocument) : null
      const sourceTokens = response.extras.source_tokens ?? markdownTokens
      const sourceTokensMethod = response.extras.source_tokens_method ?? 'estimated'
      const finalTokens = extractedTokens ?? filteredTokens ?? markdownTokens

      const costMills = (() => {
        const freshSurcharge = query.fresh ? Constants.pricing.freshSurchargeMills : 0
        if (query.objective) {
          // CF cost in mills: tokens * pricePerMToken / 1000
          const cfCostMills =
            (inputTokens * mode.inputPricePerMToken +
              completionTokens * mode.outputPricePerMToken) /
            1000
          return (
            Constants.pricing.queryBaseCostMills +
            Math.ceil(cfCostMills * Constants.pricing.queryMarkup) +
            freshSurcharge
          )
        }
        return Constants.pricing.fetchCostMills + freshSurcharge
      })()

      const requestId = Nanoid.generate()
      const aiAgent = (() => {
        const parsed = z.safeParse(
          DbSchema.request.shape.ai_agent.unwrap(),
          c.req.header('x-ai-agent'),
        )
        if (!parsed.success) return null
        return parsed.data
      })()
      await c.env.REQUEST_QUEUE.send({
        account_id: c.var.session?.account_id ?? null,
        ai_agent: aiAgent,
        api_key_id: c.var.api_key_id,
        billable,
        cached,
        cost_mills: costMills,
        extracted_tokens: extractedTokens,
        filtered_tokens: filteredTokens,
        hostname: requestURL.hostname,
        id: requestId,
        keywords: query.keywords?.join(',') || null,
        markdown_tokens: markdownTokens,
        mode: query.objective ? query.mode : null,
        objective: query.objective || null,
        organization_id: c.var.organization_id,
        path: requestURL.pathname,
        source_tokens: sourceTokens,
        source_tokens_method: sourceTokensMethod,
        url: requestURL.href,
        user_agent: userAgent,
      })

      const commonHeaders: Record<string, string> = {
        ...rateLimitHeaders,
        'access-control-expose-headers':
          'retry-after, x-cache, x-cost-mills, x-credits-remaining, x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, x-request-id, x-tokens-count, x-tokens-saved',
        vary: 'Accept',
        'x-cache': cached ? 'HIT' : 'MISS',
        'x-cost-mills': String(costMills),
        'x-request-id': requestId,
        'x-tokens-count': String(finalTokens),
        'x-tokens-saved': String(sourceTokens - finalTokens),
      }
      if (billable) {
        const billingEntityId = c.var.organization_id ?? c.var.session?.account_id
        const cached = await c.env.KV.get(`balance:${billingEntityId}`)
        if (cached !== null)
          commonHeaders['x-credits-remaining'] = String(Math.max(0, Number(cached) - costMills))
      }

      const content = c.var.session
        ? finalDocument.trimEnd()
        : `${finalDocument.trimEnd()}${Constants.attribution.suffix}`

      if (accept === 'application/json')
        // casting to string so hono/client can infer c.json response
        return c.json({ content: content as string }, 200, commonHeaders)

      return c.text(content, 200, {
        ...commonHeaders,
        'content-type': 'text/markdown; charset=utf-8',
      })
    },
  )
