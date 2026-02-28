import { zValidator as validator } from '@hono/zod-validator'
import { Octokit } from '@octokit/core'
import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { Kysely } from 'kysely'
import { ImageResponse } from 'workers-og'
import { z } from 'zod'
import * as Cookie from '#lib/cookie.ts'
import { fetchPage } from '#lib/core/fetch-page.ts'
import type { DB } from '#lib/db.gen.ts'
import { D1Dialect } from '#lib/db.ts'
import * as Nanoid from '#lib/nanoid.ts'
import {
  getOgElement,
  loadFont,
  type OgQuery,
  ogQuerySchema,
} from '#lib/og.tsx'
import { urlSchema } from '#lib/schemas.ts'

export const api = new Hono<{
  Bindings: Cloudflare.Env
  Variables: { db: Kysely<DB> }
}>()
  .use(async (c, next) => {
    c.set(
      'db',
      new Kysely<DB>({ dialect: new D1Dialect({ database: c.env.DB }) }),
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

      const cookieState = Cookie.get(c, 'curl.state')
      Cookie.destroy(c, 'curl.state', {
        domain: Cookie.getDomain(c.env.HOST),
      })
      if (!cookieState || cookieState !== query.state)
        return c.json({ error: 'State mismatch' }, 400)

      const tokenUrl = new URL('https://github.com/login/oauth/access_token')
      tokenUrl.searchParams.set('client_id', c.env.GH_CLIENT_ID)
      tokenUrl.searchParams.set('client_secret', c.env.GH_CLIENT_SECRET)
      tokenUrl.searchParams.set('code', query.code)
      const tokenRes = await fetch(tokenUrl.toString(), {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })
      const tokenData = (await tokenRes.json()) as {
        access_token?: string
        error?: string
      }
      if (tokenData.error || !tokenData.access_token)
        return c.json(
          { error: tokenData.error ?? 'Failed to get access token' },
          400,
        )

      const octokit = new Octokit({ auth: tokenData.access_token })
      const [{ data: ghUser }, { data: ghEmails }] = await Promise.all([
        octokit.request('GET /user'),
        octokit.request('GET /user/emails'),
      ])
      const primaryEmail =
        ghEmails.find((e) => e.primary)?.email ?? ghEmails[0]?.email
      if (!primaryEmail) return c.json({ error: 'No email found' }, 400)

      // Find existing account via account_provider
      const existing = await c.var.db
        .selectFrom('account_provider')
        .innerJoin('account', 'account.id', 'account_provider.account_id')
        .where('account_provider.provider', '=', 'github')
        .where('account_provider.provider_account_id', '=', String(ghUser.id))
        .select('account.id')
        .executeTakeFirst()

      let account: { id: string }
      if (existing) {
        await c.var.db
          .updateTable('account')
          .set({
            avatar_url: ghUser.avatar_url,
            email: primaryEmail,
            name: ghUser.name,
          })
          .where('id', '=', existing.id)
          .execute()
        account = existing
      } else {
        const accountId = Nanoid.generate()
        account = await c.var.db
          .insertInto('account')
          .values({
            avatar_url: ghUser.avatar_url,
            email: primaryEmail,
            id: accountId,
            name: ghUser.name,
          })
          .returning('id')
          .executeTakeFirstOrThrow()
        await c.var.db
          .insertInto('account_provider')
          .values({
            account_id: account.id,
            id: Nanoid.generate(),
            provider: 'github',
            provider_account_id: String(ghUser.id),
          })
          .execute()
      }

      const sessionId = crypto.randomUUID()
      await c.env.KV.put(
        `session:${sessionId}`,
        JSON.stringify({ account_id: account.id }),
        { expirationTtl: 86400 },
      )
      Cookie.set(c, 'curl.session', sessionId, {
        domain: Cookie.getDomain(c.env.HOST),
        httpOnly: true,
        maxAge: 86400,
        sameSite: 'Lax',
        secure: true,
      })

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
    const session = Cookie.get(c, 'curl.session')
    if (session) await c.env.KV.delete(`session:${session}`)
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
    const session = Cookie.get(c, 'curl.session')
    if (!session) return c.json({ account: null })

    const data = await c.env.KV.get(`session:${session}`)
    if (!data) return c.json({ account: null })

    const { account_id } = JSON.parse(data) as { account_id: string }
    const account = await c.var.db
      .selectFrom('account')
      .where('id', '=', account_id)
      .select(['avatar_url', 'email', 'id', 'name'])
      .executeTakeFirst()
    if (!account) return c.json({ account: null })

    const organizations = await c.var.db
      .selectFrom('organization_member')
      .innerJoin(
        'organization',
        'organization.id',
        'organization_member.organization_id',
      )
      .where('organization_member.account_id', '=', account_id)
      .where('organization.deleted_at', 'is', null)
      .select(['organization.id', 'organization.name', 'organization.slug'])
      .execute()

    return c.json({
      account: { ...account, organizations },
    })
  })
  .get('/api/health', (c) => c.json({ ok: true }))
  .get('/api/og.png', validator('query', ogQuerySchema), async (c) => {
    const query = c.req.valid('query')
    const element = await getOgElement(c.env.HOST, c.env, c.var.db, query)
    const [font, fontBold] = await Promise.all([
      loadFont(c.req.raw, c.env, '/fonts/GeistMono-Regular.ttf'),
      loadFont(c.req.raw, c.env, '/fonts/GeistMono-Black.ttf'),
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
      const session = Cookie.get(c, 'curl.session')
      if (!session) return c.json({ error: 'Unauthorized' }, 401)

      const data = await c.env.KV.get(`session:${session}`)
      if (!data) return c.json({ error: 'Unauthorized' }, 401)

      const { account_id } = JSON.parse(data) as { account_id: string }
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

      const orgId = Nanoid.generate()
      await c.var.db
        .insertInto('organization')
        .values({ id: orgId, name: json.name ?? json.slug, slug: json.slug })
        .execute()
      await c.var.db
        .insertInto('organization_member')
        .values({
          account_id,
          id: Nanoid.generate(),
          organization_id: orgId,
          role: 'owner',
        })
        .execute()

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
        const ogQuery = { page: 'url', url: url.toString() } satisfies OgQuery
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
