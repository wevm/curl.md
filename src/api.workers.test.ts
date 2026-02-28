import { env, fetchMock } from 'cloudflare:test'
import { testClient } from 'hono/testing'
import { Kysely } from 'kysely'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { api } from '#api.ts'
import * as Cookie from '#lib/cookie.ts'
import type { DB } from '#lib/db.gen.ts'
import { dialect } from '#lib/pg.ts'
import { createFactory } from '../test/factory.ts'

const client = testClient(api, env)
// Workers tests use D1 via miniflare; env.DB is a Hyperdrive stub with connectionString
const db = new Kysely<DB>({ dialect: dialect(env.DB.connectionString) })
const factory = createFactory(db)

beforeAll(() => {
  fetchMock.activate()
  fetchMock.disableNetConnect()
  return () => fetchMock.deactivate()
})

afterEach(() => {
  fetchMock.assertNoPendingInterceptors()
})

describe('GET /api/auth/github', () => {
  test('redirects to GitHub', async () => {
    const res = await client.api.auth.github.$get({ query: {} })
    expect(res.status).toBe(302)
    const location = res.headers.get('location')
    expect(location).toContain('github.com/login/oauth/authorize')
    expect(location).toContain(`client_id=${env.GH_CLIENT_ID}`)
    expect(location).toContain('state=')
  })

  test('forwards valid next param in redirect_uri', async () => {
    const res = await client.api.auth.github.$get({
      query: { next: '/myorg' },
    })
    expect(res.status).toBe(302)
    const location = res.headers.get('location')!
    const redirectUri = new URL(location).searchParams.get('redirect_uri')!
    expect(redirectUri).toContain('/api/auth/github/callback')
    expect(new URL(redirectUri).searchParams.get('next')).toBe('/myorg')
  })

  test('ignores invalid next param origin', async () => {
    const res = await client.api.auth.github.$get({
      query: { next: 'https://evil.com/steal' },
    })
    expect(res.status).toBe(302)
    const location = res.headers.get('location')!
    const redirectUri = new URL(location).searchParams.get('redirect_uri')!
    expect(new URL(redirectUri).searchParams.has('next')).toBe(false)
  })
})

describe('GET /api/auth/github/callback', () => {
  test('with mismatched state redirects to error page', async () => {
    const res = await client.api.auth.github.callback.$get({
      query: { code: 'abc', state: 'xyz' },
    })
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/auth/error')
    expect(location.searchParams.get('error')).toBe('invalid_request')
    expect(location.searchParams.get('error_description')).toBe(
      'State mismatch',
    )
  })

  test('with bad code redirects to error page', async () => {
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
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/auth/error')
    expect(location.searchParams.get('error')).toBe('bad_verification_code')
    expect(location.searchParams.get('error_description')).toBe(
      'Failed to get access token',
    )
  })

  test('creates account and redirects to /new', async () => {
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
    expect(res.headers.get('location')).toBe('https://curl.local/new')
    expect(
      res.headers.getSetCookie().some((c) => c.startsWith('curl.session=')),
    ).toBe(true)

    // Verify account was created in D1
    const provider = await db
      .selectFrom('account_provider')
      .where('provider', '=', 'github')
      .where('provider_account_id', '=', '1234')
      .selectAll()
      .executeTakeFirstOrThrow()
    const account = await db
      .selectFrom('account')
      .where('id', '=', provider.account_id)
      .selectAll()
      .executeTakeFirstOrThrow()
    expect(account.email).toBe('test@example.com')
    expect(account.name).toBe('Test User')
  })

  test('logs in existing account', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      account_id: account.id,
      organization_id: org.id,
      role: 'owner',
    })
    await factory.account_provider.insert({
      account_id: account.id,
      provider: 'github',
      provider_account_id: '9999',
    })

    const query = { code: 'existing', state: 'test-state' }

    fetchMock
      .get('https://github.com')
      .intercept({
        method: 'POST',
        path: `/login/oauth/access_token?client_id=${env.GH_CLIENT_ID}&client_secret=${env.GH_CLIENT_SECRET}&code=${query.code}`,
      })
      .reply(
        200,
        { access_token: 'ghu_existing', token_type: 'bearer' },
        { headers: { 'content-type': 'application/json' } },
      )

    fetchMock
      .get('https://api.github.com')
      .intercept({ method: 'GET', path: '/user' })
      .reply(
        200,
        {
          avatar_url: 'https://avatars.githubusercontent.com/u/9999',
          id: 9999,
          login: 'existinguser',
          name: 'Existing User',
        },
        { headers: { 'content-type': 'application/json' } },
      )
    fetchMock
      .get('https://api.github.com')
      .intercept({ method: 'GET', path: '/user/emails' })
      .reply(
        200,
        [{ email: 'existing@example.com', primary: true, verified: true }],
        { headers: { 'content-type': 'application/json' } },
      )

    const res = await client.api.auth.github.callback.$get(
      { query },
      { headers: { Cookie: `curl.state=${query.state}` } },
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`https://curl.local/${org.slug}`)

    // Verify account was updated, not duplicated
    const accounts = await db
      .selectFrom('account')
      .where('id', '=', account.id)
      .selectAll()
      .execute()
    expect(accounts).toHaveLength(1)
    expect(accounts[0]?.name).toBe('Existing User')
    expect(accounts[0]?.email).toBe('existing@example.com')

    // Verify no new org was created
    const memberships = await db
      .selectFrom('organization_member')
      .where('account_id', '=', account.id)
      .selectAll()
      .execute()
    expect(memberships).toHaveLength(1)
    expect(memberships[0]?.organization_id).toBe(org.id)
  })
})

describe('POST /api/auth/logout', () => {
  test('returns ok', async () => {
    const res = await client.api.auth.logout.$post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})

describe('GET /api/auth/me', () => {
  test('returns null without session', async () => {
    const res = await client.api.auth.me.$get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ account: null })
  })
})

test('GET /api/health returns ok', async () => {
  const res = await client.api.health.$get()
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
})

describe('POST /api/organizations', () => {
  test('without session returns 401', async () => {
    const res = await client.api.organizations.$post({
      json: { slug: 'my-org' },
    })
    expect(res.status).toBe(401)
  })

  test('creates organization and membership', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    const res = await client.api.organizations.$post(
      { json: { name: 'My Org', slug: 'my-org' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned(
            'curl.session',
            session.id,
            env.COOKIE_SECRET,
          ),
        },
      },
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: 'my-org' })

    const org = await db
      .selectFrom('organization')
      .where('slug', '=', 'my-org')
      .selectAll()
      .executeTakeFirstOrThrow()
    expect(org.name).toBe('My Org')

    const membership = await db
      .selectFrom('organization_member')
      .where('account_id', '=', account.id)
      .where('organization_id', '=', org.id)
      .selectAll()
      .executeTakeFirstOrThrow()
    expect(membership.role).toBe('owner')
  })

  test('uses slug as name when name is omitted', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    const res = await client.api.organizations.$post(
      { json: { slug: 'cli-org' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned(
            'curl.session',
            session.id,
            env.COOKIE_SECRET,
          ),
        },
      },
    )
    expect(res.status).toBe(200)

    const org = await db
      .selectFrom('organization')
      .where('slug', '=', 'cli-org')
      .selectAll()
      .executeTakeFirstOrThrow()
    expect(org.name).toBe('cli-org')
  })

  test('rejects duplicate slug', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await factory.organization.insert({ name: 'Taken', slug: 'taken' })

    const res = await client.api.organizations.$post(
      { json: { slug: 'taken' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned(
            'curl.session',
            session.id,
            env.COOKIE_SECRET,
          ),
        },
      },
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'Organization name already taken',
    })
  })
})

test('GET /api/:url fetches URL and returns markdown', async () => {
  fetchMock
    .get('https://example.com')
    .intercept({ path: '/' })
    .reply(200, '<html><body><h1>Hello</h1><p>World</p></body></html>', {
      headers: { 'content-type': 'text/html' },
    })

  const res = await client.api[':url{.+}'].$get({
    param: { url: 'example.com' },
    query: {},
  })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('text/markdown')
  const text = await res.text()
  expect(text).toContain('Hello')
  expect(text).toContain('World')
})
