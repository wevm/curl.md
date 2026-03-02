import { env, fetchMock } from 'cloudflare:test'
import { testClient } from 'hono/testing'
import { Kysely } from 'kysely'
import { describe, expect, test, vi } from 'vitest'
import { api } from '#api.ts'
import * as ApiKey from '#lib/api-key.ts'
import { assert } from '#lib/assert.ts'
import * as Cookie from '#lib/cookie.ts'
import * as Crypto from '#lib/crypto.ts'
import type { DB } from '#lib/db.gen.ts'
import { dialect } from '#lib/pg.ts'
import { createFactory } from '../test/factory.ts'

const client = testClient(api, env, {
  waitUntil: vi.fn((p: Promise<unknown>) => p),
  passThroughOnException: vi.fn(),
  props: {},
})
// Workers tests use D1 via miniflare; env.DB is a Hyperdrive stub with connectionString
const db = new Kysely<DB>({ dialect: dialect(env.DB.connectionString) })
const factory = createFactory(db)

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

  test('forwards preview subdomain next param in redirect_uri', async () => {
    const res = await client.api.auth.github.$get({
      query: { next: 'https://pr10.curl.local' },
    })
    expect(res.status).toBe(302)
    const location = res.headers.get('location')!
    const redirectUri = new URL(location).searchParams.get('redirect_uri')!
    expect(new URL(redirectUri).searchParams.get('next')).toBe(
      'https://pr10.curl.local',
    )
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

  test('creates account and redirects to account login', async () => {
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
    expect(res.headers.get('location')).toBe('https://curl.local/testuser')
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
    expect(account.login).toBe('testuser')
    expect(account.name).toBe('Test User')

    // Verify tokens are encrypted (not stored as plaintext)
    expect(provider.access_token).not.toBe('ghu_test123')
    expect(provider.access_token).toBeTruthy()
    const decrypted = await Crypto.decrypt(
      provider.access_token!,
      env.TOKEN_ENCRYPTION_KEY,
    )
    expect(decrypted).toBe('ghu_test123')
  })

  test('logs in existing account', async () => {
    const account = await factory.account.insert({ login: 'existinguser' })
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
    expect(res.headers.get('location')).toBe(
      `https://curl.local/${account.login}`,
    )

    // Verify account was updated, not duplicated
    const accounts = await db
      .selectFrom('account')
      .where('id', '=', account.id)
      .selectAll()
      .execute()
    expect(accounts).toHaveLength(1)
    expect(accounts[0]?.name).toBe('Existing User')
    expect(accounts[0]?.email).toBe('existing@example.com')
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

describe('device auth flow', () => {
  test('returns device code and user code', async () => {
    const res = await client.api.auth.device.$post()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.code).toBeDefined()
    expect(data.user_code).toMatch(/^[A-Z2-9]{8}$/)
    expect(data.verification_uri).toBe('https://curl.local/auth/device')
    expect(data.interval).toBe(1)
  })

  test('polling pending code returns authorization_pending', async () => {
    const deviceRes = await client.api.auth.device.$post()
    const device = await deviceRes.json()

    const res = await client.api.auth.device.token.$post({
      json: { code: device.code },
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'authorization_pending' })
  })

  test('polling invalid code returns expired_token', async () => {
    const res = await client.api.auth.device.token.$post({
      json: { code: 'nonexistent' },
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'expired_token' })
  })

  test('confirm without session returns 401', async () => {
    const res = await client.api.auth.device.confirm.$post({
      json: { user_code: 'ABCD1234' },
    })
    expect(res.status).toBe(401)
  })

  test('confirm with invalid code returns 404', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    const res = await client.api.auth.device.confirm.$post(
      { json: { user_code: 'INVALID1' } },
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
    expect(res.status).toBe(404)
  })

  test('full flow: create, confirm, exchange for session', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    // 1. Create device code
    const deviceRes = await client.api.auth.device.$post()
    const device = await deviceRes.json()

    // 2. Confirm (as authenticated user)
    const confirmRes = await client.api.auth.device.confirm.$post(
      { json: { user_code: device.user_code } },
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
    expect(confirmRes.status).toBe(200)
    expect(await confirmRes.json()).toEqual({ ok: true })

    // 3. Exchange device code for session
    const tokenRes = await client.api.auth.device.token.$post({
      json: { code: device.code },
    })
    expect(tokenRes.status).toBe(200)
    const tokenData = await tokenRes.json()
    expect(tokenData).toHaveProperty('session_id')
    assert('session_id' in tokenData, 'session_id not defined')

    // 4. Verify new session works
    const meRes = await client.api.auth.me.$get(
      {},
      {
        headers: {
          Authorization: `Bearer ${tokenData.session_id}`,
        },
      },
    )
    expect(meRes.status).toBe(200)
    const meData = await meRes.json()
    expect(meData.account).not.toBeNull()
    expect(meData.account!.id).toBe(account.id)

    // 5. Verify device code was consumed (deleted)
    const remaining = await db
      .selectFrom('device_code')
      .where('code', '=', device.code)
      .selectAll()
      .execute()
    expect(remaining).toHaveLength(0)
  })
})

describe('API key authentication', () => {
  const apiClient = testClient(api, env, {
    waitUntil: vi.fn((p: Promise<unknown>) => p),
    passThroughOnException: vi.fn(),
    props: {},
  })

  test('resolves API key from bearer token', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })
    const hash = await ApiKey.hash('curl_test123456')
    await factory.api_key.insert({
      organization_id: org.id,
      account_id: account.id,
      key_hash: hash,
      key_prefix: 'curl_test',
      name: 'test key',
    })

    const res = await apiClient.api.auth.me.$get(
      {},
      { headers: { Authorization: 'Bearer curl_test123456' } },
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.account).not.toBeNull()
    expect(data.account!.id).toBe(account.id)
  })

  test('rejects deleted API key', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })
    const hash = await ApiKey.hash('curl_deleted789')
    await factory.api_key.insert({
      organization_id: org.id,
      account_id: account.id,
      key_hash: hash,
      key_prefix: 'curl_dele',
      name: 'deleted key',
      deleted_at: new Date().toISOString(),
    })

    const res = await apiClient.api.auth.me.$get(
      {},
      { headers: { Authorization: 'Bearer curl_deleted789' } },
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ account: null })
  })

  test('updates last_used_at on API key use', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })
    const hash = await ApiKey.hash('curl_lastused999')
    const apiKey = await factory.api_key.insert({
      organization_id: org.id,
      account_id: account.id,
      key_hash: hash,
      key_prefix: 'curl_last',
      name: 'lastused key',
    })

    await apiClient.api.auth.me.$get(
      {},
      { headers: { Authorization: 'Bearer curl_lastused999' } },
    )

    const updated = await db
      .selectFrom('api_key')
      .where('id', '=', apiKey.id)
      .select('last_used_at')
      .executeTakeFirstOrThrow()
    expect(updated.last_used_at).not.toBeNull()
  })
})

test('GET /api/health returns ok', async () => {
  const res = await client.api.health.$get()
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
})

describe('GET /api/orgs', () => {
  test('lists organizations for authenticated account', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org1 = await factory.organization.insert({
      login: 'org-a',
      name: 'Org A',
    })
    const org2 = await factory.organization.insert({
      login: 'org-b',
      name: 'Org B',
    })
    await factory.organization_member.insert({
      organization_id: org1.id,
      account_id: account.id,
      role: 'owner',
    })
    await factory.organization_member.insert({
      organization_id: org2.id,
      account_id: account.id,
      role: 'member',
    })

    const res = await client.api.orgs.$get(
      {},
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
    const data = await res.json()
    assert(!('error' in data), 'expected organizations')
    expect(data.organizations).toHaveLength(2)
    expect(data.organizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: org1.id, login: 'org-a', role: 'owner' }),
        expect.objectContaining({
          id: org2.id,
          login: 'org-b',
          role: 'member',
        }),
      ]),
    )
  })

  test('returns 401 when not authenticated', async () => {
    const res = await client.api.orgs.$get()
    expect(res.status).toBe(401)
  })
})

describe('GET /api/orgs/:id', () => {
  test('returns org for member', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({
      login: 'show-org',
      name: 'Show Org',
    })
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'owner',
    })

    const res = await client.api.orgs[':id'].$get(
      { param: { id: org.id } },
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
    const data = await res.json()
    assert(!('error' in data), 'expected organization')
    expect(data.organization).toEqual(
      expect.objectContaining({
        id: org.id,
        login: 'show-org',
        name: 'Show Org',
        role: 'owner',
      }),
    )
  })

  test('returns 404 for non-member', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})

    const res = await client.api.orgs[':id'].$get(
      { param: { id: org.id } },
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
    expect(res.status).toBe(404)
  })
})

describe('POST /api/orgs', () => {
  test('without session returns 401', async () => {
    const res = await client.api.orgs.$post({
      json: { login: 'my-org' },
    })
    expect(res.status).toBe(401)
  })

  test('creates organization and membership', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    const res = await client.api.orgs.$post(
      { json: { login: 'my-org', name: 'My Org' } },
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
    expect(await res.json()).toEqual({ login: 'my-org' })

    const org = await db
      .selectFrom('organization')
      .where('login', '=', 'my-org')
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

  test('uses login as name when name is omitted', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    const res = await client.api.orgs.$post(
      { json: { login: 'cli-org' } },
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
      .where('login', '=', 'cli-org')
      .selectAll()
      .executeTakeFirstOrThrow()
    expect(org.name).toBe('cli-org')
  })

  test('rejects duplicate login', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await factory.organization.insert({ login: 'taken', name: 'Taken' })

    const res = await client.api.orgs.$post(
      { json: { login: 'taken' } },
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
      error: 'Login already taken',
    })
  })
})

test('GET /api/:url fetches URL and returns markdown', async () => {
  fetchMock
    .get('https://api-test.example.com')
    .intercept({ path: '/' })
    .reply(200, '<html><body><h1>Hello</h1><p>World</p></body></html>', {
      headers: { 'content-type': 'text/html' },
    })

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'api-test.example.com' }, query: {} },
    { headers: { 'cf-connecting-ip': '10.0.0.1' } },
  )
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('text/markdown')
  const text = await res.text()
  expect(text).toContain('Hello')
  expect(text).toContain('World')
})

test('GET /api/:url returns fetch rate limit headers', async () => {
  fetchMock
    .get('https://rl-fetch.example.com')
    .intercept({ path: '/' })
    .reply(200, '<html><body><p>ok</p></body></html>', {
      headers: { 'content-type': 'text/html' },
    })

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-fetch.example.com' }, query: {} },
    { headers: { 'cf-connecting-ip': '10.0.0.2' } },
  )
  expect(res.status).toBe(200)
  expect(res.headers.get('x-ratelimit-limit')).toBe('100')
  expect(res.headers.get('x-ratelimit-remaining')).toBeTruthy()
  expect(res.headers.get('x-ratelimit-reset')).toBeTruthy()
})

test('GET /api/:url authenticated accounts get higher fetch limit', async () => {
  const account = await factory.account.insert({})
  const session = await factory.session.insert({ account_id: account.id })
  fetchMock
    .get('https://rl-authed-fetch.example.com')
    .intercept({ path: '/' })
    .reply(200, '<html><body><p>ok</p></body></html>', {
      headers: { 'content-type': 'text/html' },
    })

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-authed-fetch.example.com' }, query: {} },
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
  expect(res.headers.get('x-ratelimit-limit')).toBe('1000')
})

test('GET /api/:url with q= uses stricter query limit', async () => {
  // Seed KV cache so fetchPage skips AI inference
  // (Workers AI binding requires remote connection, unavailable in tests)
  await env.KV.put(
    'page:https://rl-query.example.com/',
    JSON.stringify({
      content: '<html><body><p>ok</p></body></html>',
      contentType: 'text/html',
    }),
  )
  await env.KV.put('query:https://rl-query.example.com/:test:', 'ok')

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-query.example.com' }, query: { q: 'test' } },
    { headers: { 'cf-connecting-ip': '10.0.0.3' } },
  )
  expect(res.status).toBe(200)
  expect(res.headers.get('x-ratelimit-limit')).toBe('10')
})

test('GET /api/:url returns 429 when fetch limit exceeded', async () => {
  await env.KV.put(
    'ratelimit:fetch:192.0.2.1',
    JSON.stringify({ count: 100, reset: Math.floor(Date.now() / 1000) + 3600 }),
    { expirationTtl: 3600 },
  )

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-exceeded.example.com' }, query: {} },
    { headers: { 'cf-connecting-ip': '192.0.2.1' } },
  )
  expect(res.status).toBe(429)
  expect(res.headers.get('retry-after')).toBeTruthy()
  expect(await res.json()).toEqual({ error: 'Rate limit exceeded' })
})

test('GET /api/:url returns 429 when query limit exceeded', async () => {
  await env.KV.put(
    'ratelimit:query:192.0.2.2',
    JSON.stringify({ count: 10, reset: Math.floor(Date.now() / 1000) + 3600 }),
    { expirationTtl: 3600 },
  )

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-query-exceeded.example.com' }, query: { q: 'test' } },
    { headers: { 'cf-connecting-ip': '192.0.2.2' } },
  )
  expect(res.status).toBe(429)
  expect(res.headers.get('retry-after')).toBeTruthy()
  expect(await res.json()).toEqual({ error: 'Rate limit exceeded' })
})
