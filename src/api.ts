import { zValidator as validator } from '@hono/zod-validator'
import { Octokit } from '@octokit/core'
import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { Kysely, sql } from 'kysely'
import { jsonArrayFrom } from 'kysely/helpers/postgres'
import { ImageResponse } from 'workers-og'
import { z } from 'zod'
import * as Cookie from '#lib/cookie.ts'
import { fetchPage } from '#lib/core/fetch-page.ts'
import type { DB } from '#lib/db.gen.ts'
import * as Og from '#lib/og.tsx'
import { dialect } from '#lib/pg.ts'
import { urlSchema } from '#lib/schemas.ts'
import type { OneOf } from '#lib/types.ts'

export const api = new Hono<{
  Bindings: Cloudflare.Env
  Variables: {
    db: Kysely<DB>
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
    const sessionId = await Cookie.getSigned(
      c,
      c.env.COOKIE_SECRET,
      'curl.session',
    )
    c.set(
      'session',
      sessionId
        ? ((await c.var.db
            .selectFrom('session')
            .where('id', '=', sessionId)
            .where('expires_at', '>', new Date())
            .select('account_id')
            .executeTakeFirst()) ?? null)
        : null,
    )
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
      const state = Math.random().toString(36).substring(2)
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
          if (nextUrl.origin === origin)
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

      const errorUrl = new URL('/auth/error', `https://${c.env.HOST}`)

      const cookieState = Cookie.get(c, 'curl.state')
      Cookie.destroy(c, 'curl.state', {
        domain: Cookie.getDomain(c.env.HOST),
      })
      if (!cookieState || cookieState !== query.state) {
        errorUrl.searchParams.set('error', 'invalid_request')
        errorUrl.searchParams.set('error_description', 'State mismatch')
        return c.redirect(errorUrl.toString())
      }

      if (query.next) {
        try {
          const nextUrl = new URL(query.next)
          if (
            nextUrl.hostname !== c.env.HOST &&
            nextUrl.hostname.endsWith('.curl.md')
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
            error: string
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

      let account: { id: string }
      const sessionId = crypto.randomUUID()
      try {
        account = await c.var.db.transaction().execute(async (tx) => {
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
                const { id } = await tx
                  .insertInto('account')
                  .values({
                    avatar_url: ghUser.avatar_url,
                    email: primaryEmail,
                    name: ghUser.name,
                    role,
                  })
                  .returning('id')
                  .executeTakeFirstOrThrow()
                await tx
                  .insertInto('account_provider')
                  .values({
                    account_id: id,
                    provider: 'github',
                    provider_account_id: String(ghUser.id),
                  })
                  .execute()
                return id
              })()

          const now = new Date()
          await tx
            .insertInto('account_provider')
            .values({
              account_id: accountId,
              provider: 'github',
              provider_account_id: String(ghUser.id),
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token ?? null,
              access_token_expires_at: tokenData.expires_in
                ? new Date(now.getTime() + tokenData.expires_in * 1000)
                : null,
              refresh_token_expires_at: tokenData.refresh_token_expires_in
                ? new Date(
                    now.getTime() + tokenData.refresh_token_expires_in * 1000,
                  )
                : null,
            })
            .onConflict((oc) =>
              oc.constraint('unique_account_provider_provider').doUpdateSet({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token ?? null,
                access_token_expires_at: tokenData.expires_in
                  ? new Date(now.getTime() + tokenData.expires_in * 1000)
                  : null,
                refresh_token_expires_at: tokenData.refresh_token_expires_in
                  ? new Date(
                      now.getTime() + tokenData.refresh_token_expires_in * 1000,
                    )
                  : null,
              }),
            )
            .execute()

          await tx
            .insertInto('session')
            .values({
              id: sessionId,
              account_id: accountId,
              expires_at: sql<Date>`now() + interval '1 day'`,
            })
            .execute()

          return { id: accountId }
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
        sessionId,
        c.env.COOKIE_SECRET,
        {
          domain: Cookie.getDomain(c.env.HOST),
          httpOnly: true,
          maxAge: 86400,
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
            nextUrl.hostname.endsWith(`.${c.env.HOST}`)
          )
            return c.redirect(nextUrl.toString())
        } catch {}
      }

      const membership = await c.var.db
        .selectFrom('organization_member')
        .innerJoin(
          'organization',
          'organization.id',
          'organization_member.organization_id',
        )
        .where('organization_member.account_id', '=', account.id)
        .where('organization.deleted_at', 'is', null)
        .select('organization.slug')
        .executeTakeFirst()

      const redirect = membership
        ? `${origin}/${membership.slug}`
        : `${origin}/new`
      return c.redirect(redirect)
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
              'organization.name',
              'organization.slug',
            ]),
        ).as('organizations'),
      ])
      .executeTakeFirst()
    if (!account) return c.json({ account: null })

    return c.json({ account })
  })
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
    '/api/organizations',
    validator(
      'json',
      z.object({
        name: z.string().min(2).max(50).optional(),
        slug: z
          .string()
          .min(2)
          .max(50)
          .regex(
            /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
            'Must start and end with a lowercase letter or number, and contain only lowercase letters, numbers, or hyphens',
          ),
      }),
    ),
    async (c) => {
      if (!c.var.session) return c.json({ error: 'Unauthorized' }, 401)

      const json = c.req.valid('json')

      const reservedSlugs = new Set([
        'api',
        'check',
        'login',
        'new',
        'playground',
      ])
      if (reservedSlugs.has(json.slug))
        return c.json({ error: 'This slug is reserved' }, 409)

      const existing = await c.var.db
        .selectFrom('organization')
        .where('slug', '=', json.slug)
        .select('id')
        .executeTakeFirst()
      if (existing)
        return c.json({ error: 'Organization name already taken' }, 409)

      const accountId = c.var.session.account_id
      await c.var.db.transaction().execute(async (tx) => {
        const org = await tx
          .insertInto('organization')
          .values({ name: json.name ?? json.slug, slug: json.slug })
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

      return c.json({ slug: json.slug })
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
    // TODO: add rate limiting back
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

      const page = await fetchPage(url, {
        fresh: query.fresh !== undefined ? true : undefined,
        keywords: query.k,
        objective: query.q,
      })

      const requestId = crypto.randomUUID()
      c.env.REQUEST_QUEUE.send({
        estimated: page.estimated,
        hostname: url.hostname,
        id: requestId,
        keywords: query.k?.join(',') || null,
        markdownLength: page.markdown.length,
        objective: query.q || null,
        path: url.pathname,
        tokens_saved: page.tokensSaved ?? null,
        url: url.href,
        user_agent: c.req.header('user-agent'),
      })

      const content = `${page.markdown.trimEnd()}\n\n---\n\nPowered by [${c.env.HOST}](https://${c.env.HOST})`
      const commonHeaders = {
        'access-control-expose-headers':
          'x-request-id, x-tokens-count, x-tokens-saved',
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
