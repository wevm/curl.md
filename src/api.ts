import { zValidator as validator } from '@hono/zod-validator'
import { Octokit } from '@octokit/core'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { getDb } from '#lib/db.ts'
import * as Nanoid from '#lib/nanoid.ts'

export const api = new Hono<{ Bindings: Cloudflare.Env }>()
  .get('/api/health', (c) => c.json({ ok: true }))
  .get('/api/auth/github', (c) => {
    const state = Math.random().toString(36).substring(2)
    setCookie(c, 'curl.state', state, {
      httpOnly: true,
      maxAge: 600,
      sameSite: 'Lax',
      secure: true,
    })
    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', c.env.GH_CLIENT_ID)
    url.searchParams.set('state', state)
    return c.redirect(url.toString())
  })
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

      const cookieState = getCookie(c, 'curl.state')
      deleteCookie(c, 'curl.state')
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

      const db = getDb()
      const accountId = Nanoid.generate()
      const account = await db
        .insertInto('account')
        .values({
          avatar_url: ghUser.avatar_url,
          email: primaryEmail,
          github_id: ghUser.id,
          id: accountId,
          name: ghUser.name,
        })
        .onConflict((oc) =>
          oc.column('github_id').doUpdateSet({
            avatar_url: ghUser.avatar_url,
            email: primaryEmail,
            name: ghUser.name,
          }),
        )
        .returning('id')
        .executeTakeFirstOrThrow()

      const memberships = await db
        .selectFrom('organization_member')
        .where('account_id', '=', account.id)
        .select('organization_id')
        .execute()

      let slug: string
      if (memberships.length === 0) {
        const orgId = Nanoid.generate()
        slug = ghUser.login.toLowerCase()
        await db
          .insertInto('organization')
          .values({
            id: orgId,
            name: ghUser.login,
            plan: 'free',
            slug,
          })
          .execute()
        await db
          .insertInto('organization_member')
          .values({
            account_id: account.id,
            organization_id: orgId,
            role: 'owner',
          })
          .execute()
      } else {
        const org = await db
          .selectFrom('organization')
          .where('id', '=', memberships[0]?.organization_id as string)
          .select('slug')
          .executeTakeFirstOrThrow()
        slug = org.slug
      }

      const sessionId = crypto.randomUUID()
      await c.env.KV.put(
        `session:${sessionId}`,
        JSON.stringify({ account_id: account.id }),
        { expirationTtl: 86400 },
      )
      setCookie(c, 'curl.session', sessionId, {
        httpOnly: true,
        maxAge: 86400,
        sameSite: 'Lax',
        secure: true,
      })
      return c.redirect(`https://${c.env.HOST}/${slug}/dashboard`)
    },
  )
  .post('/api/auth/logout', async (c) => {
    const session = getCookie(c, 'curl.session')
    if (session) await c.env.KV.delete(`session:${session}`)
    deleteCookie(c, 'curl.session', {
      httpOnly: true,
      maxAge: 0,
      sameSite: 'Lax',
      secure: true,
    })
    return c.json({ ok: true })
  })
  .get('/api/auth/me', async (c) => {
    const session = getCookie(c, 'curl.session')
    if (!session) return c.json({ account: null })

    const data = await c.env.KV.get(`session:${session}`)
    if (!data) return c.json({ account: null })

    const { account_id } = JSON.parse(data) as { account_id: string }
    const db = getDb()
    const account = await db
      .selectFrom('account')
      .where('id', '=', account_id)
      .select(['avatar_url', 'email', 'github_id', 'id', 'name'])
      .executeTakeFirst()
    if (!account) return c.json({ account: null })

    const organizations = await db
      .selectFrom('organization_member')
      .innerJoin(
        'organization',
        'organization.id',
        'organization_member.organization_id',
      )
      .where('organization_member.account_id', '=', account_id)
      .where('organization.deleted_at', 'is', null)
      .select([
        'organization.id',
        'organization.name',
        'organization.plan',
        'organization.slug',
      ])
      .execute()

    return c.json({
      account: { ...account, organizations },
    })
  })
