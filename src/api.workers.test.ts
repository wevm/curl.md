import { env, fetchMock } from 'cloudflare:test'
import { testClient } from 'hono/testing'
import { Kysely } from 'kysely'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { api } from '#api.ts'
import * as ApiKey from '#lib/api-key.ts'
import { assert } from '#lib/assert.ts'
import * as Cookie from '#lib/cookie.ts'
import * as Crypto from '#lib/crypto.ts'
import type { DB } from '#lib/db.gen.ts'
import * as Nanoid from '#lib/nanoid.ts'
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
  test('rejects missing params with validation_error', async () => {
    const res = await client.api.auth.github.callback.$get({
      // @ts-expect-error -- testing missing required fields
      query: {},
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'validation_error',
      issues: expect.arrayContaining([
        { path: expect.any(String), message: expect.any(String) },
      ]),
    })
  })

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
    const login = `user-${Nanoid.generate()}`
    const ghId = Math.floor(Math.random() * 1_000_000)
    const email = `${login}@example.com`
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
          avatar_url: `https://avatars.githubusercontent.com/u/${ghId}`,
          id: ghId,
          login,
          name: 'Test User',
        },
        { headers: { 'content-type': 'application/json' } },
      )
    fetchMock
      .get('https://api.github.com')
      .intercept({ method: 'GET', path: '/user/emails' })
      .reply(200, [{ email, primary: true, verified: true }], {
        headers: { 'content-type': 'application/json' },
      })

    const res = await client.api.auth.github.callback.$get(
      { query },
      { headers: { Cookie: `curl.state=${query.state}` } },
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`https://curl.local/${login}`)
    expect(
      res.headers.getSetCookie().some((c) => c.startsWith('curl.session=')),
    ).toBe(true)

    // Verify account was created in D1
    const provider = await db
      .selectFrom('account_provider')
      .where('provider', '=', 'github')
      .where('provider_account_id', '=', String(ghId))
      .selectAll()
      .executeTakeFirstOrThrow()
    const account = await db
      .selectFrom('account')
      .where('id', '=', provider.account_id)
      .selectAll()
      .executeTakeFirstOrThrow()
    expect(account.email).toBe(email)
    expect(account.login).toBe(login)
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
    const account = await factory.account.insert({})
    const ghId = String(Math.floor(Math.random() * 1_000_000))
    await factory.account_provider.insert({
      account_id: account.id,
      provider: 'github',
      provider_account_id: ghId,
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
          avatar_url: `https://avatars.githubusercontent.com/u/${ghId}`,
          id: Number(ghId),
          login: account.login,
          name: 'Existing User',
        },
        { headers: { 'content-type': 'application/json' } },
      )
    fetchMock
      .get('https://api.github.com')
      .intercept({ method: 'GET', path: '/user/emails' })
      .reply(200, [{ email: account.email, primary: true, verified: true }], {
        headers: { 'content-type': 'application/json' },
      })

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
    expect(accounts[0]?.email).toBe(account.email)
  })

  test('with no email redirects to error page', async () => {
    const ghId = Math.floor(Math.random() * 1_000_000)
    const query = { code: 'no-email', state: 'test-state' }

    fetchMock
      .get('https://github.com')
      .intercept({
        method: 'POST',
        path: `/login/oauth/access_token?client_id=${env.GH_CLIENT_ID}&client_secret=${env.GH_CLIENT_SECRET}&code=${query.code}`,
      })
      .reply(
        200,
        { access_token: 'ghu_noemail', token_type: 'bearer' },
        { headers: { 'content-type': 'application/json' } },
      )

    fetchMock
      .get('https://api.github.com')
      .intercept({ method: 'GET', path: '/user' })
      .reply(
        200,
        {
          avatar_url: `https://avatars.githubusercontent.com/u/${ghId}`,
          id: ghId,
          login: 'noemail-user',
          name: 'No Email',
        },
        { headers: { 'content-type': 'application/json' } },
      )
    fetchMock
      .get('https://api.github.com')
      .intercept({ method: 'GET', path: '/user/emails' })
      .reply(200, [], {
        headers: { 'content-type': 'application/json' },
      })

    const res = await client.api.auth.github.callback.$get(
      { query },
      { headers: { Cookie: `curl.state=${query.state}` } },
    )
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/auth/error')
    expect(location.searchParams.get('error')).toBe('no_email')
    expect(location.searchParams.get('error_description')).toBe(
      'No email found on GitHub account',
    )
  })

  test.todo(
    'with transaction failure redirects to error page with server_error',
  )
})

describe('POST /api/auth/logout', () => {
  test('returns ok', async () => {
    const res = await client.api.auth.logout.$post()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
  })
})

describe('POST /api/auth/device', () => {
  test('returns device code and user code', async () => {
    const res = await client.api.auth.device.$post()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.code).toBeDefined()
    expect(data.user_code).toMatch(/^[A-Z2-9]{8}$/)
    expect(data.verification_uri).toBe('https://curl.local/auth/device')
    expect(data.interval).toBe(1)
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
    await expect(confirmRes.json()).resolves.toEqual({ ok: true })

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

describe('POST /api/auth/device/confirm', () => {
  test('rejects missing user_code with validation_error', async () => {
    const res = await client.api.auth.device.confirm.$post({
      // @ts-expect-error -- testing missing required field
      json: {},
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'validation_error',
      issues: expect.arrayContaining([
        { path: expect.any(String), message: expect.any(String) },
      ]),
    })
  })

  test('without session returns 401', async () => {
    const res = await client.api.auth.device.confirm.$post({
      json: { user_code: 'ABCD1234' },
    })
    expect(res.status).toBe(401)
  })

  test('with invalid code returns 404', async () => {
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
})

describe('POST /api/auth/device/token', () => {
  test('rejects missing code with validation_error', async () => {
    const res = await client.api.auth.device.token.$post({
      // @ts-expect-error -- testing missing required field
      json: {},
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'validation_error',
      issues: expect.arrayContaining([
        { path: expect.any(String), message: expect.any(String) },
      ]),
    })
  })

  test('polling pending code returns authorization_pending', async () => {
    const deviceRes = await client.api.auth.device.$post()
    const device = await deviceRes.json()

    const res = await client.api.auth.device.token.$post({
      json: { code: device.code },
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'authorization_pending',
    })
  })

  test('polling invalid code returns expired_token', async () => {
    const res = await client.api.auth.device.token.$post({
      json: { code: 'nonexistent' },
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'expired_token' })
  })
})

describe('GET /api/auth/me', () => {
  test('returns null without session', async () => {
    const res = await client.api.auth.me.$get()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ account: null })
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

    const res = await client.api.auth.me.$get(
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

    const res = await client.api.auth.me.$get(
      {},
      { headers: { Authorization: 'Bearer curl_deleted789' } },
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ account: null })
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

    await client.api.auth.me.$get(
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

describe('POST /api/tokens', () => {
  test('creates token', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    const res = await client.api.tokens.$post(
      { json: { name: 'test token' } },
      { headers: { Authorization: `Bearer ${session.id}` } },
    )
    expect(res.status).toBe(201)
    const data = await res.json()
    assert('api_key' in data, 'expected api_key')
    expect(data.api_key.name).toBe('test token')
    expect(data.api_key.token.startsWith('curl_')).toBe(true)
    expect(data.api_key.key_prefix).toBe(data.api_key.token.slice(0, 14))

    const stored = await db
      .selectFrom('api_key')
      .where('id', '=', data.api_key.id)
      .select('key_hash')
      .executeTakeFirstOrThrow()
    const expectedHash = await ApiKey.hash(data.api_key.token)
    expect(stored.key_hash).toBe(expectedHash)
  })

  test('requires auth', async () => {
    const res = await client.api.tokens.$post({
      json: { name: 'test token' },
    })
    expect(res.status).toBe(401)
  })

  test('blocks API key auth', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })
    const token = 'curl_blockapikey123'
    const hash = await ApiKey.hash(token)
    await factory.api_key.insert({
      organization_id: org.id,
      account_id: account.id,
      key_hash: hash,
      key_prefix: token.slice(0, 14),
      name: 'existing key',
    })

    const res = await client.api.tokens.$post(
      { json: { name: 'new token' } },
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(403)
  })

  test('associates with active organization', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })

    const res = await client.api.tokens.$post(
      { json: { name: 'org token' } },
      {
        headers: {
          Authorization: `Bearer ${session.id}`,
          'x-organization-id': org.id,
        },
      },
    )
    expect(res.status).toBe(201)
    const data = await res.json()
    assert('api_key' in data, 'expected api_key')
    expect(data.api_key.organization_id).toBe(org.id)
  })

  test('rejects duplicate name', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    await client.api.tokens.$post(
      { json: { name: 'dupe' } },
      { headers: { Authorization: `Bearer ${session.id}` } },
    )
    const res = await client.api.tokens.$post(
      { json: { name: 'dupe' } },
      { headers: { Authorization: `Bearer ${session.id}` } },
    )
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data).toEqual({ error: 'name_taken' })
  })
})

describe('GET /api/tokens', () => {
  test('lists tokens', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await factory.api_key.insert({
      account_id: account.id,
      key_hash: await ApiKey.hash('curl_list1'),
      key_prefix: 'curl_list1',
      name: 'key 1',
    })
    await factory.api_key.insert({
      account_id: account.id,
      key_hash: await ApiKey.hash('curl_list2'),
      key_prefix: 'curl_list2',
      name: 'key 2',
    })

    const res = await client.api.tokens.$get(
      {},
      { headers: { Authorization: `Bearer ${session.id}` } },
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as Extract<
      Awaited<ReturnType<typeof res.json>>,
      { api_keys: unknown }
    >
    expect(data.api_keys).toHaveLength(2)
  })

  test('excludes deleted tokens', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await factory.api_key.insert({
      account_id: account.id,
      key_hash: await ApiKey.hash('curl_active1'),
      key_prefix: 'curl_active',
      name: 'active key',
    })
    await factory.api_key.insert({
      account_id: account.id,
      key_hash: await ApiKey.hash('curl_deleted1'),
      key_prefix: 'curl_delete',
      name: 'deleted key',
      deleted_at: new Date().toISOString(),
    })

    const res = await client.api.tokens.$get(
      {},
      { headers: { Authorization: `Bearer ${session.id}` } },
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as Extract<
      Awaited<ReturnType<typeof res.json>>,
      { api_keys: unknown }
    >
    expect(data.api_keys).toHaveLength(1)
  })

  test('requires auth', async () => {
    const res = await client.api.tokens.$get()
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/tokens/:id', () => {
  test('soft deletes token', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const apiKey = await factory.api_key.insert({
      account_id: account.id,
      key_hash: await ApiKey.hash('curl_softdel1'),
      key_prefix: 'curl_softde',
      name: 'to delete',
    })

    const res = await client.api.tokens[':id'].$delete(
      { param: { id: apiKey.id } },
      { headers: { Authorization: `Bearer ${session.id}` } },
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })

    const row = await db
      .selectFrom('api_key')
      .where('id', '=', apiKey.id)
      .select('deleted_at')
      .executeTakeFirstOrThrow()
    expect(row.deleted_at).not.toBeNull()
  })

  test('returns 404 for nonexistent', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    const res = await client.api.tokens[':id'].$delete(
      { param: { id: 'nonexistent-id' } },
      { headers: { Authorization: `Bearer ${session.id}` } },
    )
    expect(res.status).toBe(404)
  })

  test('cannot delete another account token', async () => {
    const account1 = await factory.account.insert({})
    const account2 = await factory.account.insert({})
    const session2 = await factory.session.insert({ account_id: account2.id })
    const apiKey = await factory.api_key.insert({
      account_id: account1.id,
      key_hash: await ApiKey.hash('curl_other1'),
      key_prefix: 'curl_other',
      name: 'account1 key',
    })

    const res = await client.api.tokens[':id'].$delete(
      { param: { id: apiKey.id } },
      { headers: { Authorization: `Bearer ${session2.id}` } },
    )
    expect(res.status).toBe(404)
  })
})

test('GET /api/health returns ok', async () => {
  const res = await client.api.health.$get()
  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ ok: true })
})

describe('GET /api/orgs', () => {
  test('lists organizations for authenticated account', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org1 = await factory.organization.insert({})
    const org2 = await factory.organization.insert({})
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
        expect.objectContaining({
          id: org1.id,
          login: org1.login,
          role: 'owner',
        }),
        expect.objectContaining({
          id: org2.id,
          login: org2.login,
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
    const org = await factory.organization.insert({})
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
        login: org.login,
        name: org.name,
        role: 'owner',
      }),
    )
  })

  test('returns 401 when not authenticated', async () => {
    const org = await factory.organization.insert({})
    const res = await client.api.orgs[':id'].$get({
      param: { id: org.id },
    })
    expect(res.status).toBe(401)
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
  test('rejects invalid login with validation_error', async () => {
    const res = await client.api.orgs.$post({
      json: { login: '!' },
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'validation_error',
      issues: expect.arrayContaining([
        { path: 'login', message: expect.any(String) },
      ]),
    })
  })

  test('rejects missing login with validation_error', async () => {
    const res = await client.api.orgs.$post({
      // @ts-expect-error -- testing missing required field
      json: {},
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'validation_error',
      issues: expect.arrayContaining([
        { path: 'login', message: expect.any(String) },
      ]),
    })
  })

  test('without session returns 401', async () => {
    const res = await client.api.orgs.$post({
      json: { login: 'my-org' },
    })
    expect(res.status).toBe(401)
  })

  test('creates organization and membership', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const login = `org-${Nanoid.generate()}`

    const res = await client.api.orgs.$post(
      { json: { login, name: 'My Org' } },
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
    await expect(res.json()).resolves.toEqual({ login })

    const org = await db
      .selectFrom('organization')
      .where('login', '=', login)
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
    const login = `org-${Nanoid.generate()}`

    const res = await client.api.orgs.$post(
      { json: { login } },
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
      .where('login', '=', login)
      .selectAll()
      .executeTakeFirstOrThrow()
    expect(org.name).toBe(login)
  })

  test('rejects reserved login', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    const res = await client.api.orgs.$post(
      { json: { login: 'dash' } },
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
    await expect(res.json()).resolves.toEqual({
      error: 'login_reserved',
    })
  })

  test('rejects login taken by account', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const other = await factory.account.insert({})

    const res = await client.api.orgs.$post(
      { json: { login: other.login } },
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
    await expect(res.json()).resolves.toEqual({ error: 'login_taken' })
  })

  test('rejects duplicate login', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const existing = await factory.organization.insert({})

    const res = await client.api.orgs.$post(
      { json: { login: existing.login } },
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
    await expect(res.json()).resolves.toEqual({
      error: 'login_taken',
    })
  })
})

describe('GET /api/cli/latest', () => {
  afterEach(async () => {
    await env.KV.delete('cli:latest')
  })

  test('returns latest version from npm registry', async () => {
    fetchMock
      .get('https://registry.npmjs.org')
      .intercept({ path: '/curl.md' })
      .reply(
        200,
        {
          'dist-tags': { latest: '0.0.4' },
          time: { '0.0.4': '2025-03-04T00:00:00.000Z' },
        },
        { headers: { 'content-type': 'application/json' } },
      )

    const res = await client.api.cli.latest.$get({ query: {} })
    assert(res.status === 200, 'expected 200')
    const json = await res.json()
    expect(json.version).toBe('0.0.4')
    expect(json.published_at).toBe('2025-03-04T00:00:00.000Z')
  })

  test('returns cached version from KV', async () => {
    const cached = {
      published_at: '2025-02-01T00:00:00.000Z',
      version: '0.0.3',
    }
    await env.KV.put('cli:latest', JSON.stringify(cached), {
      expirationTtl: 300,
    })

    const res = await client.api.cli.latest.$get({ query: {} })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(cached)
  })

  test('returns 502 when npm registry is down', async () => {
    fetchMock
      .get('https://registry.npmjs.org')
      .intercept({ path: '/curl.md' })
      .reply(503, 'Service Unavailable')

    const res = await client.api.cli.latest.$get({ query: {} })
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toEqual({ error: 'upstream_error' })
  })

  test('returns 502 when no latest version in registry', async () => {
    fetchMock
      .get('https://registry.npmjs.org')
      .intercept({ path: '/curl.md' })
      .reply(
        200,
        { 'dist-tags': {} },
        {
          headers: { 'content-type': 'application/json' },
        },
      )

    const res = await client.api.cli.latest.$get({ query: {} })
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toEqual({ error: 'version_not_found' })
  })

  test('accepts analytics query params', async () => {
    fetchMock
      .get('https://registry.npmjs.org')
      .intercept({ path: '/curl.md' })
      .reply(
        200,
        {
          'dist-tags': { latest: '0.0.4' },
          time: { '0.0.4': '2025-03-04T00:00:00.000Z' },
        },
        { headers: { 'content-type': 'application/json' } },
      )

    const res = await client.api.cli.latest.$get({
      query: {
        current: '0.0.3',
        os: 'darwin',
        arch: 'arm64',
        standalone: 'true',
      },
    })
    assert(res.status === 200, 'expected 200')
    const json = await res.json()
    expect(json.version).toBe('0.0.4')
  })
})

test('GET /api/:url rejects invalid url with validation_error', async () => {
  const res = await client.api[':url{.+}'].$get({
    param: { url: '!' },
    query: {},
  })
  expect(res.status).toBe(400)
  await expect(res.json()).resolves.toEqual({
    error: 'validation_error',
    issues: expect.arrayContaining([
      { path: expect.any(String), message: expect.any(String) },
    ]),
  })
})

test('GET /api/:url returns 403 for invalid x-organization-id', async () => {
  const account = await factory.account.insert({})
  const session = await factory.session.insert({ account_id: account.id })
  const org = await factory.organization.insert({})

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'example.com' }, query: {} },
    {
      headers: {
        Cookie: await Cookie.generateSigned(
          'curl.session',
          session.id,
          env.COOKIE_SECRET,
        ),
        'x-organization-id': org.id,
      },
    },
  )
  expect(res.status).toBe(403)
  await expect(res.json()).resolves.toEqual({
    error: 'organization_access_denied',
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
  await expect(res.json()).resolves.toEqual({ error: 'rate_limit_exceeded' })
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
  await expect(res.json()).resolves.toEqual({ error: 'rate_limit_exceeded' })
})
