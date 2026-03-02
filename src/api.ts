import { zValidator as validator } from '@hono/zod-validator'
import { Octokit } from '@octokit/core'
import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { Kysely, sql } from 'kysely'
import { jsonArrayFrom } from 'kysely/helpers/postgres'
import { customAlphabet } from 'nanoid'
import { ImageResponse } from 'workers-og'
import { z } from 'zod'
import * as ApiKey from '#lib/api-key.ts'
import { attribution } from '#lib/constants.ts'
import * as Cookie from '#lib/cookie.ts'
import { fetchPage } from '#lib/core/fetch-page.ts'
import * as Crypto from '#lib/crypto.ts'
import type { DB } from '#lib/db.gen.ts'
import * as Nanoid from '#lib/nanoid.ts'
import * as Og from '#lib/og.tsx'
import { dialect } from '#lib/pg.ts'
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
    if (!cookie && sessionId?.startsWith('curl_')) {
      const keyHash = await ApiKey.hash(sessionId)
      const apiKey = await c.var.db
        .selectFrom('api_key')
        .where('key_hash', '=', keyHash)
        .where('deleted_at', 'is', null)
        .select(['id', 'account_id', 'organization_id'])
        .executeTakeFirst()
      if (apiKey) {
        c.set('api_key_id', apiKey.id)
        c.set('organization_id', apiKey.organization_id)
        c.set('session', { account_id: apiKey.account_id })
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

      const tokenUrl = new URL('https://github.com/login/oauth/access_token')
      tokenUrl.searchParams.set('client_id', c.env.GH_CLIENT_ID)
      tokenUrl.searchParams.set('client_secret', c.env.GH_CLIENT_SECRET)
      tokenUrl.searchParams.set('code', query.code)
      const tokenRes = await fetch(tokenUrl.toString(), {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })
      const tokenData = (await tokenRes.json()) as OneOf<
        | {
            access_token: string
            expires_in?: number
            refresh_token?: string
            refresh_token_expires_in?: number
            scope: string
            token_type: 'bearer'
          }
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
      if (tokenData.error) {
        errorUrl.searchParams.set('error', tokenData.error)
        errorUrl.searchParams.set(
          'error_description',
          'Failed to get access token',
        )
        return c.redirect(errorUrl.toString())
      }

      const octokit = new Octokit({ auth: tokenData.access_token })
      const [{ data: ghUser }, { data: ghEmails }] = await Promise.all([
        octokit.request('GET /user'),
        octokit.request('GET /user/emails'),
      ])
      const primaryEmail =
        ghEmails.find((e) => e.primary)?.email ?? ghEmails[0]?.email
      if (!primaryEmail) {
        errorUrl.searchParams.set('error', 'no_email')
        errorUrl.searchParams.set(
          'error_description',
          'No email found on GitHub account',
        )
        return c.redirect(errorUrl.toString())
      }

      const crewGitHubIds = new Set([6759464, 7336481])
      const role = crewGitHubIds.has(ghUser.id) ? 'crew' : 'user'

      let result: { accountId: string; sessionId: string }
      try {
        result = await c.var.db.transaction().execute(async (tx) => {
          const existing = await tx
            .selectFrom('account_provider')
            .where('provider', '=', 'github')
            .where('provider_account_id', '=', String(ghUser.id))
            .select('account_id')
            .executeTakeFirst()

          const accountId = existing
            ? (
                await tx
                  .updateTable('account')
                  .set({
                    avatar_url: ghUser.avatar_url,
                    email: primaryEmail,
                    name: ghUser.name,
                    role,
                  })
                  .where('id', '=', existing.account_id)
                  .returning('id')
                  .executeTakeFirstOrThrow()
              ).id
            : await (async () => {
                const values = {
                  avatar_url: ghUser.avatar_url,
                  email: primaryEmail,
                  login: ghUser.login,
                  name: ghUser.name,
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
                      login: `${ghUser.login}-${Nanoid.generate()}`,
                    })
                    .returning('id')
                    .executeTakeFirstOrThrow())
                await tx
                  .insertInto('account_provider')
                  .values({
                    account_id: inserted.id,
                    provider: 'github',
                    provider_account_id: String(ghUser.id),
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
              provider_account_id: String(ghUser.id),
              access_token: encryptedAccessToken,
              refresh_token: encryptedRefreshToken,
              access_token_expires_at,
              refresh_token_expires_at,
            })
            .onConflict((oc) =>
              oc.constraint('unique_account_provider_provider').doUpdateSet({
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
    return c.json({ ok: true })
  })
  .get('/api/auth/me', async (c) => {
    if (!c.var.session) return c.json({ account: null })

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
    if (!account) return c.json({ account: null })

    return c.json({ account })
  })
  .get('/api/orgs', async (c) => {
    if (!c.var.session) return c.json({ error: 'Unauthorized' }, 401)

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

    return c.json({ organizations })
  })
  .get('/api/orgs/:id', async (c) => {
    if (!c.var.session) return c.json({ error: 'Unauthorized' }, 401)

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
    return c.json({ organization })
  })
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
    return c.json({
      code,
      interval: 1,
      user_code,
      verification_uri: `https://${c.env.HOST}/auth/device`,
    })
  })
  .post(
    '/api/auth/device/token',
    validator('json', z.object({ code: z.string() })),
    async (c) => {
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
      return c.json({ session_id: session.id })
    },
  )
  .post(
    '/api/auth/device/confirm',
    validator('json', z.object({ user_code: z.string() })),
    async (c) => {
      if (!c.var.session) return c.json({ error: 'Unauthorized' }, 401)
      const json = c.req.valid('json')
      const row = await c.var.db
        .selectFrom('device_code')
        .where('user_code', '=', json.user_code)
        .where('status', '=', 'pending')
        .where('expires_at', '>', new Date())
        .select('id')
        .executeTakeFirst()
      if (!row) return c.json({ error: 'Invalid or expired code' }, 404)
      await c.var.db
        .updateTable('device_code')
        .set({
          account_id: c.var.session.account_id,
          status: 'approved',
        })
        .where('id', '=', row.id)
        .execute()
      return c.json({ ok: true })
    },
  )
  .get('/api/health', (c) => c.json({ ok: true }))
  .get('/api/og.png', validator('query', Og.schema), async (c) => {
    const query = c.req.valid('query')
    const element = await Og.getElement(c.env.HOST, c.env, c.var.db, query)
    const [font, fontBold] = await Promise.all([
      Og.loadFont(c.req.raw, c.env, '/fonts/GeistMono-Regular.ttf'),
      Og.loadFont(c.req.raw, c.env, '/fonts/GeistMono-Black.ttf'),
    ])
    return new ImageResponse(element, {
      fonts: [
        { data: font, name: 'Geist Mono', style: 'normal', weight: 400 },
        { data: fontBold, name: 'Geist Mono', style: 'normal', weight: 900 },
      ],
      format: 'png',
      headers: {
        'cache-control':
          query.page === 'url' ? 'public, max-age=3600' : 'public, max-age=300',
      },
      height: 630,
      width: 1200,
    })
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
      if (!c.var.session) return c.json({ error: 'Unauthorized' }, 401)

      const json = c.req.valid('json')

      const reservedLogins = new Set([
        ...knownRoutes,
        'api',
        'curl',
        'dash',
        'org',
      ])
      if (reservedLogins.has(json.login))
        return c.json({ error: 'This login is reserved' }, 409)

      const [existingOrg, existingAccount] = await Promise.all([
        c.var.db
          .selectFrom('organization')
          .where('login', '=', json.login)
          .select('id')
          .executeTakeFirst(),
        c.var.db
          .selectFrom('account')
          .where('login', '=', json.login)
          .select('id')
          .executeTakeFirst(),
      ])
      if (existingOrg || existingAccount)
        return c.json({ error: 'Login already taken' }, 409)

      const accountId = c.var.session.account_id
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

      return c.json({ login: json.login })
    },
  )
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
        fresh: z.string().optional(),
        k: z
          .string()
          .transform((v) => v.split(/[\s,]+/).filter(Boolean))
          .optional(),
        q: z.string().optional(),
      }),
    ),
    // TODO: add error handling back
    async (c) => {
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
        )
      }

      // Rate limit: two tiers (fetch = abuse prevention, query = cost protection)
      // TODO: use metered billing for authenticated accounts so no limits
      const identity = c.var.session
        ? c.var.session.account_id
        : (c.req.header('cf-connecting-ip') ?? 'unknown')
      const isAuthed = !!c.var.session
      const limit = query.q
        ? {
            key: `query:${identity}` as const,
            max: isAuthed ? 100 : 10,
            window: 3600,
          }
        : {
            key: `fetch:${identity}` as const,
            max: isAuthed ? 1000 : 100,
            window: 3600,
          }

      const kvKey = `ratelimit:${limit.key}` as const
      const now = Math.floor(Date.now() / 1000)
      const record = await c.env.KV.get(kvKey, 'json')

      const reset =
        record && record.reset > now ? record.reset : now + limit.window
      const count = record && record.reset > now ? record.count + 1 : 1

      const rateLimitHeaders = {
        'x-ratelimit-limit': String(limit.max),
        'x-ratelimit-remaining': String(Math.max(0, limit.max - count)),
        'x-ratelimit-reset': String(reset),
      }

      if (count > limit.max)
        return c.json(
          { error: 'Rate limit exceeded' },
          {
            status: 429,
            headers: {
              ...rateLimitHeaders,
              'retry-after': String(reset - now),
            },
          },
        )

      c.executionCtx.waitUntil(
        c.env.KV.put(kvKey, JSON.stringify({ count, reset }), {
          expirationTtl: limit.window,
        }),
      )

      const page = await fetchPage(url, {
        fresh: query.fresh !== undefined ? true : undefined,
        keywords: query.k,
        objective: query.q,
      })

      const requestId = Nanoid.generate()
      c.env.REQUEST_QUEUE.send({
        account_id: c.var.session?.account_id ?? null,
        api_key_id: c.var.api_key_id,
        estimated: page.estimated,
        hostname: url.hostname,
        id: requestId,
        keywords: query.k?.join(',') || null,
        markdownLength: page.markdown.length,
        objective: query.q || null,
        organization_id: c.var.organization_id,
        path: url.pathname,
        tokens_saved: page.tokensSaved ?? null,
        url: url.href,
        user_agent: c.req.header('user-agent'),
      })

      const content = c.var.session
        ? page.markdown.trimEnd()
        : `${page.markdown.trimEnd()}${attribution.suffix}`
      const commonHeaders = {
        ...rateLimitHeaders,
        'access-control-expose-headers':
          'retry-after, x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, x-request-id, x-tokens-count, x-tokens-saved',
        'x-request-id': requestId,
        'x-tokens-count': String(page.tokensCount),
        'x-tokens-saved': String(page.tokensSaved),
      }

      if (c.req.header('accept')?.includes('application/json'))
        return c.json({ content }, { headers: commonHeaders })

      return new Response(content, {
        headers: {
          ...commonHeaders,
          'content-type': 'text/markdown; charset=utf-8',
        },
      })
    },
  )
