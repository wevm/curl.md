import { env, fetchMock } from 'cloudflare:test'
import { testClient } from 'hono/testing'
import { Kysely } from 'kysely'
import { afterEach, beforeAll, expect, test } from 'vitest'
import { api } from '#api.ts'
import type { DB } from '#lib/db.gen.ts'
import { D1Dialect } from '#lib/db.ts'

const client = testClient(api, env)
const db = new Kysely<DB>({ dialect: new D1Dialect({ database: env.DB }) })

beforeAll(() => {
  fetchMock.activate()
  fetchMock.disableNetConnect()
  return () => fetchMock.deactivate()
})

afterEach(() => {
  fetchMock.assertNoPendingInterceptors()
})

test('GET /api/health returns ok', async () => {
  const res = await client.api.health.$get()
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
})

test('GET /api/auth/github redirects to GitHub', async () => {
  const res = await client.api.auth.github.$get()
  expect(res.status).toBe(302)
  const location = res.headers.get('location')
  expect(location).toContain('github.com/login/oauth/authorize')
  expect(location).toContain(`client_id=${env.GH_CLIENT_ID}`)
  expect(location).toContain('state=')
})

test('GET /api/auth/github/callback with mismatched state returns 400', async () => {
  const res = await client.api.auth.github.callback.$get({
    query: { code: 'abc', state: 'xyz' },
  })
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'State mismatch' })
})

test('GET /api/auth/github/callback with bad code returns error', async () => {
  const query = { code: 'bad', state: 'test-state' }

  fetchMock
    .get('https://github.com')
    .intercept({
      method: 'POST',
      path: `/login/oauth/access_token?client_id=${env.GH_CLIENT_ID}&client_secret=${env.GH_CLIENT_SECRET}&code=${query.code}`,
    })
    .reply(
      200,
      { error: 'bad_verification_code', error_description: 'Bad code' },
      { headers: { 'content-type': 'application/json' } },
    )

  const res = await client.api.auth.github.callback.$get(
    { query },
    { headers: { Cookie: `curl.state=${query.state}` } },
  )
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'bad_verification_code' })
})

test('GET /api/auth/github/callback creates account and org', async () => {
  const query = { code: 'good', state: 'test-state' }

  fetchMock
    .get('https://github.com')
    .intercept({
      method: 'POST',
      path: `/login/oauth/access_token?client_id=${env.GH_CLIENT_ID}&client_secret=${env.GH_CLIENT_SECRET}&code=${query.code}`,
    })
    .reply(
      200,
      { access_token: 'ghu_test123', token_type: 'bearer' },
      { headers: { 'content-type': 'application/json' } },
    )

  fetchMock
    .get('https://api.github.com')
    .intercept({ method: 'GET', path: '/user' })
    .reply(
      200,
      {
        avatar_url: 'https://avatars.githubusercontent.com/u/1234',
        id: 1234,
        login: 'testuser',
        name: 'Test User',
      },
      { headers: { 'content-type': 'application/json' } },
    )
  fetchMock
    .get('https://api.github.com')
    .intercept({ method: 'GET', path: '/user/emails' })
    .reply(
      200,
      [{ email: 'test@example.com', primary: true, verified: true }],
      { headers: { 'content-type': 'application/json' } },
    )

  const res = await client.api.auth.github.callback.$get(
    { query },
    { headers: { Cookie: `curl.state=${query.state}` } },
  )
  expect(res.status).toBe(302)
  expect(res.headers.get('location')).toBe(
    'https://curl.local/testuser/dashboard',
  )
  expect(
    res.headers.getSetCookie().some((c) => c.startsWith('curl.session=')),
  ).toBe(true)

  // Verify account was created in D1
  const account = await db
    .selectFrom('account')
    .where('github_id', '=', 1234)
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(account.email).toBe('test@example.com')
  expect(account.name).toBe('Test User')

  // Verify org was created
  const org = await db
    .selectFrom('organization')
    .where('slug', '=', 'testuser')
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(org.plan).toBe('free')

  // Verify membership
  const member = await db
    .selectFrom('organization_member')
    .where('account_id', '=', account.id)
    .where('organization_id', '=', org.id)
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(member.role).toBe('owner')
})

test('GET /api/auth/me returns null without session', async () => {
  const res = await client.api.auth.me.$get()
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ account: null })
})

test('POST /api/auth/logout returns ok', async () => {
  const res = await client.api.auth.logout.$post()
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
})
