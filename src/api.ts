import * as Md from 'curl.md'
import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { Kysely, sql } from 'kysely'
import { jsonArrayFrom } from 'kysely/helpers/postgres'
import { customAlphabet } from 'nanoid'
import { estimateTokenCount } from 'tokenx'
import { stringify as yamlStringify } from 'yaml'
import { z } from 'zod'
import * as ApiKey from '#lib/api-key.ts'
import { chunkMarkdown, filterSectionsByKeywords } from '#lib/chunk-markdown.ts'
import {
  attribution,
  packageName,
  sentinalValue,
  systemPrompt,
} from '#lib/constants.ts'
import * as Cookie from '#lib/cookie.ts'
import * as Crypto from '#lib/crypto.ts'
import type { DB } from '#lib/db.gen.ts'
import { dialect } from '#lib/db.ts'
import { narrowValidation, validationError, validator } from '#lib/hono.ts'
import * as Nanoid from '#lib/nanoid.ts'
import * as Og from '#lib/og.tsx'
import { knownRoutes } from '#lib/routes.ts'
import { urlSchema } from '#lib/schemas.ts'
import type { OneOf } from '#lib/types.ts'

export const api = new Hono<{
  Bindings: Cloudflare.Env
  Variables: {
    api_key_id: string | null
    db: Kysely<DB>
    organization_id: string | null
    session: Pick<DB.session, 'account_id'> | null
  }
}>()
  .use(async (c, next) => {
    c.set(
      'db',
      new Kysely<DB>({
        dialect: dialect(c.env.DB.connectionString),
      }),
    )

    c.set('api_key_id', null)
    c.set('organization_id', null)
    c.set('session', null)

    // Try cookie → session lookup
    const cookie = await Cookie.getSigned(
      c,
      c.env.COOKIE_SECRET,
      'curl.session',
    )
    const sessionId =
      cookie ??
      (() => {
        const authorizationHeader = c.req.header('authorization')
        return authorizationHeader?.startsWith('Bearer ')
          ? authorizationHeader.replace('Bearer ', '')
          : undefined
      })()

    // Try API key (curl_ prefix)
    if (!cookie && sessionId?.startsWith(ApiKey.prefix)) {
      const keyHash = await ApiKey.hash(sessionId)
      const apiKey = await c.var.db
        .selectFrom('api_key')
        .where('key_hash', '=', keyHash)
        .where('deleted_at', 'is', null)
        .select(['id', 'account_id', 'organization_id', 'last_used_at'])
        .executeTakeFirst()
      if (apiKey) {
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
    }

    // Try session lookup (cookie or bearer token)
    if (sessionId) {
      const session =
        (await c.var.db
          .selectFrom('session')
          .where('id', '=', sessionId)
          .where('expires_at', '>', new Date())
          .select('account_id')
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
    validator(
      'query',
      z.object({
        next: z.optional(z.union([z.string(), z.undefined()])),
      }),
    ),
    (c) => {
      if (narrowValidation) return validationError(c)
      const query = c.req.valid('query')
      const state = crypto.randomUUID()
      Cookie.set(c, 'curl.state', state, {
        domain: Cookie.getDomain(c.env.HOST),
        httpOnly: true,
        maxAge: 600,
        sameSite: 'Lax',
        secure: true,
      })

      const origin = `https://${c.env.HOST}`
      const callbackUrl = new URL(`/api/auth/github/callback`, origin)
      if (query.next) {
        try {
          const nextUrl = new URL(query.next, origin)
          if (
            nextUrl.origin === origin ||
            nextUrl.hostname.endsWith(Cookie.getDomain(c.env.HOST))
          )
            callbackUrl.searchParams.set('next', query.next)
        } catch {}
      }

      const url = new URL('https://github.com/login/oauth/authorize')
      url.searchParams.set('client_id', c.env.GH_CLIENT_ID)
      url.searchParams.set('redirect_uri', callbackUrl.toString())
      url.searchParams.set('state', state)
      return c.redirect(url.toString())
    },
  )
  .get(
    '/api/auth/github/callback',
    validator(
      'query',
      z.object({
        code: z.string(),
        next: z.optional(z.union([z.string(), z.undefined()])),
        state: z.string(),
      }),
    ),
    async (c) => {
      if (narrowValidation) return validationError(c)
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
            const previewCallback = new URL(
              '/api/auth/github/callback',
              nextUrl.origin,
            )
            previewCallback.searchParams.set('code', query.code)
            previewCallback.searchParams.set('state', query.state)
            return c.redirect(previewCallback.toString())
          }
        } catch {}
      }

      const cookieState = Cookie.get(c, 'curl.state')
      Cookie.destroy(c, 'curl.state', {
        domain: Cookie.getDomain(c.env.HOST),
      })
      const errorUrl = new URL('/auth/error', `https://${c.env.HOST}`)
      if (!cookieState || cookieState !== query.state) {
        errorUrl.searchParams.set('error', 'invalid_request')
        errorUrl.searchParams.set('error_description', 'State mismatch')
        return c.redirect(errorUrl.toString())
      }

      let tokenData: {
        access_token: string
        expires_in?: number
        refresh_token?: string
        refresh_token_expires_in?: number
        scope: string
        token_type: 'bearer'
      }
      try {
        const tokenUrl = new URL('https://github.com/login/oauth/access_token')
        tokenUrl.searchParams.set('client_id', c.env.GH_CLIENT_ID)
        tokenUrl.searchParams.set('client_secret', c.env.GH_CLIENT_SECRET)
        tokenUrl.searchParams.set('code', query.code)
        const tokenRes = await fetch(tokenUrl.toString(), {
          method: 'POST',
          headers: { Accept: 'application/json' },
        })
        const json = (await tokenRes.json()) as OneOf<
          | typeof tokenData
          | {
              error:
                | 'bad_verification_code'
                | 'incorrect_client_credentials'
                | 'redirect_uri_mismatch'
                | 'unverified_user_email'
              error_description: string
              error_uri: string
            }
        >
        if (json.error) {
          errorUrl.searchParams.set('error', json.error)
          errorUrl.searchParams.set(
            'error_description',
            'Failed to get access token',
          )
          return c.redirect(errorUrl.toString())
        }
        tokenData = json
      } catch {
        errorUrl.searchParams.set('error', 'server_error')
        errorUrl.searchParams.set('error_description', 'Failed to reach GitHub')
        return c.redirect(errorUrl.toString())
      }

      const { Octokit } = await import('@octokit/core')
      const octokit = new Octokit({ auth: tokenData.access_token })
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

      const primaryEmail =
        emailsRes.data.find((e) => e.primary)?.email ?? emailsRes.data[0]?.email
      if (!primaryEmail) {
        errorUrl.searchParams.set('error', 'no_email')
        errorUrl.searchParams.set(
          'error_description',
          'No email found on GitHub account',
        )
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
            ? new Date(
                now.getTime() + tokenData.refresh_token_expires_in * 1000,
              )
            : null
          const encryptedAccessToken = await Crypto.encrypt(
            tokenData.access_token,
            c.env.TOKEN_ENCRYPTION_KEY,
          )
          const encryptedRefreshToken = tokenData.refresh_token
            ? await Crypto.encrypt(
                tokenData.refresh_token,
                c.env.TOKEN_ENCRYPTION_KEY,
              )
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
        console.error('OAuth callback error:', error)
        errorUrl.searchParams.set('error', 'server_error')
        errorUrl.searchParams.set(
          'error_description',
          'Something went wrong creating your account',
        )
        return c.redirect(errorUrl.toString())
      }

      await Cookie.setSigned(
        c,
        'curl.session',
        result.sessionId,
        c.env.COOKIE_SECRET,
        {
          domain: Cookie.getDomain(c.env.HOST),
          httpOnly: true,
          maxAge: 2592000, // 30 days
          sameSite: 'Lax',
          secure: true,
        },
      )

      const origin = `https://${c.env.HOST}`
      if (query.next) {
        try {
          const nextUrl = new URL(query.next, origin)
          if (
            nextUrl.origin === origin ||
            nextUrl.hostname.endsWith(Cookie.getDomain(c.env.HOST))
          )
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
    validator('json', z.object({ user_code: z.string() })),
    async (c) => {
      if (narrowValidation) return validationError(c)
      if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)
      const json = c.req.valid('json')
      const row = await c.var.db
        .selectFrom('device_code')
        .where('user_code', '=', json.user_code)
        .where('status', '=', 'pending')
        .where('expires_at', '>', new Date())
        .select('id')
        .executeTakeFirst()
      if (!row) return c.json({ error: 'invalid_or_expired_code' }, 404)
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
    validator('json', z.object({ code: z.string() })),
    async (c) => {
      if (narrowValidation) return validationError(c)
      const json = c.req.valid('json')
      const deviceCode = await c.var.db
        .selectFrom('device_code')
        .where('code', '=', json.code)
        .select(['account_id', 'expires_at', 'id', 'status'])
        .executeTakeFirst()
      if (!deviceCode || deviceCode.expires_at <= new Date())
        return c.json({ error: 'expired_token' }, 400)
      if (deviceCode.status === 'pending')
        return c.json({ error: 'authorization_pending' }, 400)
      if (!deviceCode.account_id) return c.json({ error: 'expired_token' }, 400)
      const session = await c.var.db
        .insertInto('session')
        .values({
          account_id: deviceCode.account_id,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await c.var.db
        .deleteFrom('device_code')
        .where('id', '=', deviceCode.id)
        .execute()
      return c.json({ session_id: session.id }, 200)
    },
  )
  .post('/api/auth/logout', async (c) => {
    const sessionId = await Cookie.getSigned(
      c,
      c.env.COOKIE_SECRET,
      'curl.session',
    )
    if (sessionId)
      await c.var.db.deleteFrom('session').where('id', '=', sessionId).execute()
    Cookie.destroy(c, 'curl.session', {
      domain: Cookie.getDomain(c.env.HOST),
      httpOnly: true,
      maxAge: 0,
      sameSite: 'Lax',
      secure: true,
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
            .innerJoin(
              'organization',
              'organization.id',
              'organization_member.organization_id',
            )
            .whereRef('organization_member.account_id', '=', 'account.id')
            .where('organization.deleted_at', 'is', null)
            .select([
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
    validator(
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
      if (narrowValidation) return validationError(c)

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
      const res = await fetch(`https://registry.npmjs.org/${packageName}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) return c.json({ error: 'upstream_error' }, 502)

      const npm = z.safeParse(
        z.object({
          'dist-tags': z.object({ latest: z.string() }).optional(),
          time: z.record(z.string(), z.string()).optional(),
        }),
        await res.json(),
      )
      if (!npm.success || !npm.data['dist-tags']?.latest)
        return c.json({ error: 'version_not_found' }, 502)

      const version = npm.data['dist-tags'].latest
      const result = {
        published_at: npm.data.time?.[version] ?? null,
        version,
      }
      c.executionCtx.waitUntil(
        c.env.KV.put('cli:latest', JSON.stringify(result), {
          expirationTtl: 300, // 5 minutes
        }),
      )
      return c.json(result, 200)
    },
  )
  .get('/api/credits', async (c) => {
    if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

    const orgId = c.req.header('x-organization-id')
    if (orgId) {
      if (!c.var.organization_id)
        return c.json({ error: 'organization_access_denied' }, 403)
      const org = await c.var.db
        .selectFrom('organization')
        .where('id', '=', orgId)
        .select('balance_mills')
        .executeTakeFirst()
      return c.json({ balance_mills: org?.balance_mills ?? 0 }, 200)
    }

    const account = await c.var.db
      .selectFrom('account')
      .where('id', '=', c.var.session.account_id)
      .select('balance_mills')
      .executeTakeFirst()
    return c.json({ balance_mills: account?.balance_mills ?? 0 }, 200)
  })
  .post(
    '/api/credits/add',
    validator(
      'json',
      z.object({
        amount: z.enum(['500', '1000', '2000', '5000']),
        organization_id: z.string().optional(),
      }),
    ),
    async (c) => {
      if (narrowValidation) return validationError(c)
      if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

      const json = c.req.valid('json')
      const amount = Number(json.amount)

      // Determine billing entity
      let stripeCustomerId: string | null = null
      let entityId: string
      let entityType: 'account' | 'organization'

      if (json.organization_id) {
        // Check org membership + role
        const member = await c.var.db
          .selectFrom('organization_member')
          .where('organization_id', '=', json.organization_id)
          .where('account_id', '=', c.var.session.account_id)
          .select('role')
          .executeTakeFirst()
        if (!member) return c.json({ error: 'organization_access_denied' }, 403)
        if (member.role !== 'owner' && member.role !== 'admin')
          return c.json({ error: 'organization_access_denied' }, 403)

        const org = await c.var.db
          .selectFrom('organization')
          .where('id', '=', json.organization_id)
          .select('stripe_customer_id')
          .executeTakeFirst()
        if (!org) return c.json({ error: 'not_found' }, 404)

        stripeCustomerId = org.stripe_customer_id
        entityId = json.organization_id
        entityType = 'organization'
      } else {
        const account = await c.var.db
          .selectFrom('account')
          .where('id', '=', c.var.session.account_id)
          .select('stripe_customer_id')
          .executeTakeFirst()
        if (!account) return c.json({ error: 'not_found' }, 404)

        stripeCustomerId = account.stripe_customer_id
        entityId = c.var.session.account_id
        entityType = 'account'
      }

      const { default: Stripe } = await import('stripe')
      const stripe = new Stripe(c.env.STRIPE_SECRET_KEY)

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
          // Another request won the race — use existing customer
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

      if (!stripeCustomerId) return c.json({ error: 'not_found' }, 404)

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: `${amount} credits` },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        metadata: { entity_type: entityType, entity_id: entityId },
        mode: 'payment',
        success_url: `https://${c.env.HOST}`,
        cancel_url: `https://${c.env.HOST}`,
      })

      return c.json({ url: session.url, checkout_id: session.id }, 200)
    },
  )
  .get('/api/credits/checkout/:id', async (c) => {
    if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

    const { default: Stripe } = await import('stripe')
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY)

    try {
      const session = await stripe.checkout.sessions.retrieve(c.req.param('id'))
      return c.json({ status: session.status }, 200)
    } catch {
      return c.json({ error: 'not_found' }, 404)
    }
  })
  .get('/api/health', (c) => c.json({ ok: true }, 200))
  .get('/api/stats', async (c) => {
    try {
      const result = await c.var.db
        .selectFrom('request')
        .select((eb) => eb.fn.sum<number>('tokens_saved').as('total'))
        .executeTakeFirstOrThrow()
      return c.json({ tokens_saved: result.total ?? 0 }, 200)
    } catch {
      return c.json({ tokens_saved: 0 }, 200)
    }
  })
  .get('/api/invites/:token', async (c) => {
    const invite = await c.var.db
      .selectFrom('organization_invite')
      .innerJoin(
        'organization',
        'organization.id',
        'organization_invite.organization_id',
      )
      .where('organization_invite.token', '=', c.req.param('token'))
      .where('organization_invite.deleted_at', 'is', null)
      .where('organization_invite.expires_at', '>', new Date())
      .where((eb) =>
        eb.or([
          eb('organization_invite.max_uses', 'is', null),
          eb(
            'organization_invite.use_count',
            '<',
            eb.ref('organization_invite.max_uses'),
          ),
        ]),
      )
      .select([
        'organization.login',
        'organization.name',
        'organization_invite.role',
      ])
      .executeTakeFirst()

    if (!invite) return c.json({ error: 'not_found' }, 404)
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
    if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

    const invite = await c.var.db
      .selectFrom('organization_invite')
      .where('token', '=', c.req.param('token'))
      .where('deleted_at', 'is', null)
      .where('expires_at', '>', new Date())
      .where((eb) =>
        eb.or([
          eb('max_uses', 'is', null),
          eb('use_count', '<', eb.ref('max_uses')),
        ]),
      )
      .select(['organization_id', 'role'])
      .executeTakeFirst()
    if (!invite) return c.json({ error: 'not_found' }, 404)

    const inserted = await c.var.db
      .insertInto('organization_member')
      .values({
        account_id: c.var.session.account_id,
        organization_id: invite.organization_id,
        role: invite.role,
      })
      .onConflict((oc) =>
        oc.columns(['organization_id', 'account_id']).doNothing(),
      )
      .returning('id')
      .executeTakeFirst()
    if (!inserted) return c.json({ error: 'already_member' }, 409)

    await c.var.db
      .updateTable('organization_invite')
      .set({ use_count: sql`use_count + 1` })
      .where('token', '=', c.req.param('token'))
      .where((eb) =>
        eb.or([
          eb('max_uses', 'is', null),
          eb('use_count', '<', eb.ref('max_uses')),
        ]),
      )
      .execute()

    const organization = await c.var.db
      .selectFrom('organization')
      .where('id', '=', invite.organization_id)
      .select(['id', 'login'])
      .executeTakeFirstOrThrow()

    return c.json({ organization }, 200)
  })
  .get('/api/og.png', validator('query', Og.schema), async (c) => {
    if (narrowValidation) return validationError(c)
    const query = c.req.valid('query')
    try {
      const element = await Og.getElement(c.env.HOST, c.env, c.var.db, query)
      const [font, fontBold] = await Promise.all([
        Og.loadFont(c.req.raw, c.env, '/fonts/GeistMono-Regular.ttf'),
        Og.loadFont(c.req.raw, c.env, '/fonts/GeistMono-Black.ttf'),
      ])
      const { ImageResponse } = await import('workers-og')
      return new ImageResponse(element, {
        fonts: [
          { data: font, name: 'Geist Mono', style: 'normal', weight: 400 },
          { data: fontBold, name: 'Geist Mono', style: 'normal', weight: 900 },
        ],
        format: 'png',
        headers: {
          'cache-control':
            query.page === 'url'
              ? 'public, max-age=3600'
              : 'public, max-age=300',
        },
        height: 630,
        width: 1200,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: 'og_generation_failed', message }, 500)
    }
  })
  .get('/api/orgs', async (c) => {
    if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

    const organizations = await c.var.db
      .selectFrom('organization_member')
      .innerJoin(
        'organization',
        'organization.id',
        'organization_member.organization_id',
      )
      .where('organization_member.account_id', '=', c.var.session.account_id)
      .where('organization.deleted_at', 'is', null)
      .select([
        'organization.id',
        'organization.login',
        'organization.name',
        'organization_member.role',
      ])
      .execute()

    return c.json({ organizations }, 200)
  })
  .get('/api/orgs/:id', async (c) => {
    if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

    const organization = await c.var.db
      .selectFrom('organization')
      .innerJoin(
        'organization_member',
        'organization_member.organization_id',
        'organization.id',
      )
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

    if (!organization) return c.json({ error: 'Not found' }, 404)
    return c.json({ organization }, 200)
  })
  .post(
    '/api/orgs',
    validator(
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
      if (narrowValidation) return validationError(c)
      if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

      const json = c.req.valid('json')

      const reservedLogins = new Set([
        ...knownRoutes,
        'api',
        'curl',
        'dash',
        'org',
      ])
      if (reservedLogins.has(json.login))
        return c.json({ error: 'login_reserved' }, 409)

      const existingLogin = await c.var.db
        .selectFrom((eb) =>
          eb
            .selectFrom('account')
            .select('id')
            .where('login', '=', json.login)
            .unionAll(
              eb
                .selectFrom('organization')
                .select('id')
                .where('login', '=', json.login),
            )
            .as('existing'),
        )
        .select('id')
        .limit(1)
        .executeTakeFirst()
      if (existingLogin) return c.json({ error: 'login_taken' }, 409)

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
        return c.json({ error: 'login_taken' }, 409)
      }

      return c.json({ login: json.login }, 200)
    },
  )
  .post(
    '/api/orgs/:id/invites',
    validator(
      'json',
      z.object({
        expires_in: z.number().int().positive().optional(),
        max_uses: z.number().int().positive().nullable().default(null),
        role: z.enum(['member', 'admin']).default('member'),
      }),
    ),
    async (c) => {
      if (narrowValidation) return validationError(c)
      if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

      const member = await c.var.db
        .selectFrom('organization_member')
        .where('organization_id', '=', c.req.param('id'))
        .where('account_id', '=', c.var.session.account_id)
        .where('role', 'in', ['owner', 'admin'])
        .select('id')
        .executeTakeFirst()
      if (!member) return c.json({ error: 'forbidden' }, 403)

      const json = c.req.valid('json')
      const token = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 32)()
      const expires_at = new Date(
        Date.now() + (json.expires_in ?? 604800) * 1000,
      )

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
    if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

    const member = await c.var.db
      .selectFrom('organization_member')
      .where('organization_id', '=', c.req.param('id'))
      .where('account_id', '=', c.var.session.account_id)
      .where('role', 'in', ['owner', 'admin'])
      .select('id')
      .executeTakeFirst()
    if (!member) return c.json({ error: 'forbidden' }, 403)

    const invites = await c.var.db
      .selectFrom('organization_invite')
      .where('organization_id', '=', c.req.param('id'))
      .where('deleted_at', 'is', null)
      .select([
        'created_at',
        'expires_at',
        'id',
        'max_uses',
        'role',
        'token',
        'use_count',
      ])
      .orderBy('created_at', 'desc')
      .execute()

    return c.json({ invites }, 200)
  })
  .delete('/api/orgs/:id/invites/:inviteId', async (c) => {
    if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

    const member = await c.var.db
      .selectFrom('organization_member')
      .where('organization_id', '=', c.req.param('id'))
      .where('account_id', '=', c.var.session.account_id)
      .where('role', 'in', ['owner', 'admin'])
      .select('id')
      .executeTakeFirst()
    if (!member) return c.json({ error: 'forbidden' }, 403)

    const result = await c.var.db
      .updateTable('organization_invite')
      .set({ deleted_at: new Date() })
      .where('id', '=', c.req.param('inviteId'))
      .where('organization_id', '=', c.req.param('id'))
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (!result.numUpdatedRows) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true }, 200)
  })
  .get('/api/orgs/:id/members', async (c) => {
    if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

    const member = await c.var.db
      .selectFrom('organization_member')
      .where('organization_id', '=', c.req.param('id'))
      .where('account_id', '=', c.var.session.account_id)
      .where('role', 'in', ['owner', 'admin'])
      .select('id')
      .executeTakeFirst()
    if (!member) return c.json({ error: 'forbidden' }, 403)

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
    validator(
      'json',
      z.object({
        login: z.string(),
        role: z.enum(['member', 'admin']).default('member'),
      }),
    ),
    async (c) => {
      if (narrowValidation) return validationError(c)
      if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

      const currentMember = await c.var.db
        .selectFrom('organization_member')
        .where('organization_id', '=', c.req.param('id'))
        .where('account_id', '=', c.var.session.account_id)
        .where('role', 'in', ['owner', 'admin'])
        .select('role')
        .executeTakeFirst()
      if (!currentMember) return c.json({ error: 'forbidden' }, 403)

      const json = c.req.valid('json')
      if (currentMember.role === 'admin' && json.role === 'admin')
        return c.json({ error: 'forbidden' }, 403)

      const account = await c.var.db
        .selectFrom('account')
        .where('login', '=', json.login)
        .where('deleted_at', 'is', null)
        .select('id')
        .executeTakeFirst()
      if (!account) return c.json({ error: 'account_not_found' }, 404)

      const member = await c.var.db
        .insertInto('organization_member')
        .values({
          account_id: account.id,
          organization_id: c.req.param('id'),
          role: json.role,
        })
        .onConflict((oc) =>
          oc.columns(['organization_id', 'account_id']).doNothing(),
        )
        .returning('id')
        .executeTakeFirst()
      if (!member) return c.json({ error: 'already_member' }, 409)

      return c.json(
        { member: { id: member.id, login: json.login, role: json.role } },
        201,
      )
    },
  )
  .patch(
    '/api/orgs/:id/members/:memberId',
    validator('json', z.object({ role: z.enum(['member', 'admin']) })),
    async (c) => {
      if (narrowValidation) return validationError(c)
      if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

      const currentMember = await c.var.db
        .selectFrom('organization_member')
        .where('organization_id', '=', c.req.param('id'))
        .where('account_id', '=', c.var.session.account_id)
        .where('role', 'in', ['owner', 'admin'])
        .select(['id', 'role'])
        .executeTakeFirst()
      if (!currentMember) return c.json({ error: 'forbidden' }, 403)
      if (currentMember.id === c.req.param('memberId'))
        return c.json({ error: 'forbidden' }, 403)

      const member = await c.var.db
        .selectFrom('organization_member')
        .where('id', '=', c.req.param('memberId'))
        .where('organization_id', '=', c.req.param('id'))
        .select('role')
        .executeTakeFirst()
      if (!member) return c.json({ error: 'not_found' }, 404)
      if (member.role === 'owner')
        return c.json({ error: 'cannot_change_owner' }, 403)

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
    if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

    const currentMember = await c.var.db
      .selectFrom('organization_member')
      .where('organization_id', '=', c.req.param('id'))
      .where('account_id', '=', c.var.session.account_id)
      .where('role', 'in', ['owner', 'admin'])
      .select(['id', 'role'])
      .executeTakeFirst()
    if (!currentMember) return c.json({ error: 'forbidden' }, 403)
    if (currentMember.id === c.req.param('memberId'))
      return c.json({ error: 'cannot_remove_self' }, 403)

    const member = await c.var.db
      .selectFrom('organization_member')
      .where('id', '=', c.req.param('memberId'))
      .where('organization_id', '=', c.req.param('id'))
      .select('role')
      .executeTakeFirst()
    if (!member) return c.json({ error: 'not_found' }, 404)
    if (member.role === 'owner')
      return c.json({ error: 'cannot_remove_owner' }, 403)

    await c.var.db
      .deleteFrom('organization_member')
      .where('id', '=', c.req.param('memberId'))
      .where('organization_id', '=', c.req.param('id'))
      .execute()

    return c.json({ ok: true }, 200)
  })
  .post(
    '/api/tokens',
    validator('json', z.object({ name: z.string().min(1).max(255) })),
    async (c) => {
      if (narrowValidation) return validationError(c)
      if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)
      if (c.var.api_key_id) return c.json({ error: 'forbidden' }, 403)

      const json = c.req.valid('json')

      const existing = await c.var.db
        .selectFrom('api_key')
        .where('account_id', '=', c.var.session.account_id)
        .where('name', '=', json.name)
        .where('deleted_at', 'is', null)
        .select('id')
        .executeTakeFirst()
      if (existing) return c.json({ error: 'name_taken' }, 409)

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
        .returning([
          'id',
          'name',
          'key_prefix',
          'organization_id',
          'created_at',
        ])
        .executeTakeFirstOrThrow()

      return c.json({ api_key: { ...row, token } }, 201)
    },
  )
  .get('/api/tokens', async (c) => {
    if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

    const api_keys = await c.var.db
      .selectFrom('api_key')
      .where('account_id', '=', c.var.session.account_id)
      .where('deleted_at', 'is', null)
      .select([
        'id',
        'name',
        'key_prefix',
        'organization_id',
        'last_used_at',
        'created_at',
      ])
      .orderBy('created_at', 'desc')
      .execute()

    return c.json({ api_keys }, 200)
  })
  .delete('/api/tokens/:id', async (c) => {
    if (!c.var.session) return c.json({ error: 'unauthorized' }, 401)

    const result = await c.var.db
      .updateTable('api_key')
      .set({ deleted_at: new Date() })
      .where('id', '=', c.req.param('id'))
      .where('account_id', '=', c.var.session.account_id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (!result.numUpdatedRows) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true }, 200)
  })
  .post('/api/stripe/webhook', async (c) => {
    const body = await c.req.text()
    const signature = c.req.header('stripe-signature')
    if (!signature) return c.json({ error: 'missing_signature' }, 400)

    const { default: Stripe } = await import('stripe')
    const stripe = new Stripe(c.env.STRIPE_SECRET_KEY)

    let event: import('stripe').Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        c.env.STRIPE_WEBHOOK_SECRET,
      )
    } catch {
      return c.json({ error: 'invalid_signature' }, 400)
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data
          .object as import('stripe').Stripe.Checkout.Session
        const customer =
          typeof session.customer === 'string' ? session.customer : null
        if (customer && session.amount_total)
          c.env.STRIPE_WEBHOOK_QUEUE.send({
            type: event.type,
            data: {
              amount_total: session.amount_total,
              customer,
              id: session.id,
            },
          })
        break
      }
      case 'charge.dispute.created': {
        // TODO: send chargeback alert (email/Slack)
        const dispute = event.data.object as import('stripe').Stripe.Dispute
        const charge =
          typeof dispute.charge === 'string'
            ? await stripe.charges.retrieve(dispute.charge)
            : dispute.charge
        const customer =
          typeof charge.customer === 'string' ? charge.customer : null
        if (customer)
          c.env.STRIPE_WEBHOOK_QUEUE.send({
            type: event.type,
            data: {
              amount_total: dispute.amount,
              customer,
              id: dispute.id,
            },
          })
        break
      }
      case 'charge.refunded': {
        const charge = event.data.object as import('stripe').Stripe.Charge
        const refund = charge.refunds?.data?.[0]
        const customer =
          typeof charge.customer === 'string' ? charge.customer : null
        if (refund && customer)
          c.env.STRIPE_WEBHOOK_QUEUE.send({
            type: event.type,
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
    '/api/:url{.+}',
    validator(
      'param',
      z.object({
        url: urlSchema.refine(
          (url) =>
            !/\.(action|aspx?|cgi|css|eot|gif|html?|ico|jpe?g|json|jsx?|map|php|png|svg|tsx?|ttf|webp|woff2?|xml|ya?ml)$/i.test(
              new URL(url).hostname,
            ),
        ),
      }),
    ),
    validator(
      'query',
      z.object({
        fresh: z
          .union([z.literal('').transform(() => true), z.coerce.boolean()])
          .optional()
          .default(false),
        k: z
          .string()
          .transform((v) => v.split(/[\s,]+/).filter(Boolean))
          .optional(),
        q: z.string().optional(),
      }),
    ),
    async (c) => {
      if (narrowValidation) return validationError(c)
      const url = new URL(c.req.valid('param').url)
      const query = c.req.valid('query')

      if (
        /Twitterbot|facebookexternalhit|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot/i.test(
          c.req.header('user-agent') ?? '',
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
<meta property="og:description" content="Fetch any URL as Markdown" />
<meta property="og:image" content="${ogUrl}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${`https://${c.env.HOST}/${url}`}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${`${c.env.HOST}/${url}`}" />
<meta name="twitter:description" content="Fetch any URL as Markdown" />
<meta name="twitter:image" content="${ogUrl}" />`,
          200,
        )
      }

      const orgHeader = c.req.header('x-organization-id')
      if (orgHeader && !c.var.organization_id)
        return c.json({ error: 'organization_access_denied' }, 403)

      // Rate limit: three tiers (anon, authed/free, paid)
      const identity = c.var.session
        ? c.var.session.account_id
        : (c.req.header('cf-connecting-ip') ?? 'unknown')
      const isAuthed = !!c.var.session
      // Cost calculated after fetchPage (need chunk count for queries)

      // Check balance for paid tier
      let billable = false
      if (isAuthed) {
        const billingEntityId =
          c.var.organization_id ?? c.var.session?.account_id
        const balanceKey = `balance:${billingEntityId}` as const
        const cached = await c.env.KV.get(balanceKey)
        const balanceMills = cached !== null ? Number(cached) : 0
        if (balanceMills > 0) billable = true
      }

      const limit = query.q
        ? {
            key: `query:${identity}` as const,
            max: isAuthed ? 10 : 3,
            window: 3600,
          }
        : {
            key: `fetch:${identity}` as const,
            max: isAuthed ? 1000 : 100,
            window: 3600,
          }

      // Paid users skip rate limiting
      let rateLimitHeaders: Record<string, string> = {}
      if (!billable) {
        const kvKey = `ratelimit:${limit.key}` as const
        const now = Math.floor(Date.now() / 1000)
        const record = await c.env.KV.get(kvKey, 'json')

        const reset =
          record && record.reset > now ? record.reset : now + limit.window
        const count = record && record.reset > now ? record.count + 1 : 1

        rateLimitHeaders = {
          'x-ratelimit-limit': String(limit.max),
          'x-ratelimit-remaining': String(Math.max(0, limit.max - count)),
          'x-ratelimit-reset': String(reset),
        }

        if (count > limit.max)
          return c.json(
            {
              error: 'rate_limit_exceeded',
              ...(isAuthed && {
                message: 'Add credits to remove rate limits',
              }),
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
        rules: {
          // TODO: curl.md rule (since worker cannot fetch itself)
          ...Md.rules,
          ...Md.sites.github({
            token: c.var.session
              ? await c.var.db
                  .selectFrom('account_provider')
                  .where('account_id', '=', c.var.session.account_id)
                  .where('provider', '=', 'github')
                  .select(['access_token', 'access_token_expires_at'])
                  .executeTakeFirst()
                  .then((provider) => {
                    if (!provider?.access_token) return undefined
                    if (
                      provider.access_token_expires_at &&
                      provider.access_token_expires_at < new Date()
                    )
                      return undefined
                    return Crypto.decrypt(
                      provider.access_token,
                      c.env.TOKEN_ENCRYPTION_KEY,
                    )
                  })
              : undefined,
          }),
        },
        fallbacks: [
          Md.fallbacks.browserUA(),
          Md.fallbacks.cfBrowserRendering({
            accountId: c.env.CLOUDFLARE_ACCOUNT_ID,
            apiToken: c.env.CLOUDFLARE_API_TOKEN,
          }),
        ],
      })

      const response = await (async () => {
        const pageCacheKey = `page:${url.href}` as const
        const cached = await c.env.KV.get(pageCacheKey, 'json')
        if (!query.fresh && cached) return { ...cached, ok: true, status: 200 }
        const result = await md.fetch(url)
        if (!result.ok) return result
        c.executionCtx.waitUntil(
          c.env.KV.put(pageCacheKey, JSON.stringify(result), {
            expirationTtl: 900,
          }),
        )
        return result
      })()

      if (!response.ok)
        return c.json(
          {
            error: 'fetch_failed',
            message: `Upstream returned ${response.status}`,
          },
          502,
        )

      const filteredContent = (() => {
        if (query.k && query.k.length > 0)
          return filterSectionsByKeywords(response.content, query.k)
        return response.content
      })()

      let inputTokens = 0
      let excerpt = filteredContent
      if (query.q) {
        try {
          const result = await (async () => {
            const queryCacheKey =
              `query:${url.href}:${query.q}:${query.k?.join(',') ?? ''}` as const
            const cached = await c.env.KV.get(queryCacheKey)
            if (!query.fresh && cached)
              return { excerpt: cached, inputTokens: 0 }

            const extractChunk = async (chunk: string) => {
              const output = z.parse(
                z.object({
                  response: z.string().default(''),
                  usage: z
                    .object({ prompt_tokens: z.number().default(0) })
                    .default({ prompt_tokens: 0 }),
                }),
                await c.env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
                  max_tokens: 4096,
                  messages: [
                    { role: 'system', content: systemPrompt },
                    {
                      role: 'user',
                      content: `<page_content>\n${chunk}\n</page_content>\n\nObjective: ${query.q}`,
                    },
                  ],
                }),
              )
              return output
            }

            const chunks = chunkMarkdown(filteredContent)
            const results = await Promise.all(chunks.map(extractChunk))
            const filtered = results
              .filter((r) => r.response && r.response.trim() !== sentinalValue)
              .map((r) => r.response)
              .join('\n\n')
            const promptTokens = results.reduce(
              (sum, r) => sum + r.usage.prompt_tokens,
              0,
            )

            c.executionCtx.waitUntil(
              c.env.KV.put(queryCacheKey, filtered, { expirationTtl: 900 }),
            )
            return { excerpt: filtered, inputTokens: promptTokens }
          })()
          inputTokens = result.inputTokens
          excerpt = result.excerpt
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error'
          return c.json({ error: 'ai_failed', message }, 502)
        }
      }

      const frontmatter = (() => {
        const yaml = yamlStringify(response.meta, { lineWidth: 0 }).trimEnd()
        return yaml ? `---\n${yaml}\n---` : undefined
      })()
      const markdown = frontmatter ? `${frontmatter}\n\n${excerpt}` : excerpt
      const tokensCount = estimateTokenCount(markdown)
      const tokensSaved =
        estimateTokenCount(response.content) - estimateTokenCount(excerpt)

      // Fetch: 1 mill. Query: 1 mill base + 1 mill per 1K input tokens
      const costMills = query.q ? 1 + Math.ceil(inputTokens / 1000) : 1

      const requestId = Nanoid.generate()
      c.env.REQUEST_QUEUE.send({
        account_id: c.var.session?.account_id ?? null,
        api_key_id: c.var.api_key_id,
        billable,
        cost_mills: costMills,
        hostname: url.hostname,
        id: requestId,
        keywords: query.k?.join(',') || null,
        markdownTokens: tokensCount,
        objective: query.q || null,
        organization_id: c.var.organization_id,
        path: url.pathname,
        tokens_saved: tokensSaved,
        url: url.href,
        user_agent: c.req.header('user-agent'),
      })

      const content = c.var.session
        ? markdown.trimEnd()
        : `${markdown.trimEnd()}${attribution.suffix}`
      const commonHeaders: Record<string, string> = {
        ...rateLimitHeaders,
        'access-control-expose-headers':
          'retry-after, x-cost-mills, x-credits-remaining, x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, x-request-id, x-tokens-count, x-tokens-saved',
        'x-cost-mills': String(costMills),
        'x-request-id': requestId,
        'x-tokens-count': String(tokensCount),
        'x-tokens-saved': String(tokensSaved),
      }
      if (billable) {
        const billingEntityId =
          c.var.organization_id ?? c.var.session?.account_id
        const cached = await c.env.KV.get(`balance:${billingEntityId}`)
        if (cached !== null)
          commonHeaders['x-credits-remaining'] = String(
            Math.max(0, Number(cached) - costMills),
          )
      }

      if (c.req.header('accept')?.includes('application/json'))
        return c.json({ content }, 200, commonHeaders)

      return c.text(content, 200, {
        ...commonHeaders,
        'content-type': 'text/markdown; charset=utf-8',
      })
    },
  )
