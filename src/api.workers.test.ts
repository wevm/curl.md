import { env, fetchMock } from 'cloudflare:test'
import { testClient } from 'hono/testing'
import { Kysely } from 'kysely'
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest'
import { api } from '#api.ts'
import * as ApiKey from '#lib/api-key.ts'
import { assert } from '#lib/assert.ts'
import * as Cookie from '#lib/cookie.ts'
import * as Crypto from '#lib/crypto.ts'
import type { DB } from '#lib/db.gen.ts'
import { dialect } from '#lib/db.ts'
import * as Nanoid from '#lib/nanoid.ts'
import { createFactory } from '../test/factory.ts'

const client = testClient(api, env, {
  waitUntil: vi.fn((p: Promise<unknown>) => p),
  passThroughOnException: vi.fn(),
  props: {},
})
// Workers tests use D1 via miniflare; env.DB is a Hyperdrive stub with connectionString
const db = new Kysely<DB>({
  dialect: dialect(env.DB.connectionString, { max: 1 }),
})
const factory = createFactory(db)

afterAll(() => db.destroy())

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
    assert(res.status === 200, 'expected 200')
    const json = await res.json()
    expect(json.code).toBeDefined()
    expect(json.user_code).toMatch(/^[A-Z2-9]{8}$/)
    expect(json.verification_uri).toBe('https://curl.local/auth/device')
    expect(json.interval).toBe(1)
  })

  test('full flow: create, confirm, exchange for session', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    // 1. Create device code
    const deviceRes = await client.api.auth.device.$post()
    assert(deviceRes.status === 200, 'expected 200')
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
    assert(deviceRes.status === 200, 'expected 200')
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

  test('returns 429 when rate limit exceeded', async () => {
    await env.KV.put(
      'ratelimit:device_token:192.0.2.10',
      JSON.stringify({ count: 30, reset: Math.floor(Date.now() / 1000) + 60 }),
      { expirationTtl: 60 },
    )

    const res = await client.api.auth.device.token.$post(
      { json: { code: 'anything' } },
      { headers: { 'cf-connecting-ip': '192.0.2.10' } },
    )
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
    await expect(res.json()).resolves.toEqual({
      error: 'rate_limit_exceeded',
    })
  })
})

test('POST /api/auth/device returns 429 when rate limit exceeded', async () => {
  await env.KV.put(
    'ratelimit:device:192.0.2.11',
    JSON.stringify({ count: 5, reset: Math.floor(Date.now() / 1000) + 60 }),
    { expirationTtl: 60 },
  )

  const res = await client.api.auth.device.$post(
    {},
    { headers: { 'cf-connecting-ip': '192.0.2.11' } },
  )
  expect(res.status).toBe(429)
  expect(res.headers.get('retry-after')).toBeTruthy()
  await expect(res.json()).resolves.toEqual({ error: 'rate_limit_exceeded' })
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
    const json = await res.json()
    expect(json.account).not.toBeNull()
    expect(json.account!.id).toBe(account.id)
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
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'invalid_api_key' })
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

describe('GET /api/credits', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await client.api.credits.$get({})
    expect(res.status).toBe(401)
  })

  test('returns account balance', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ balance_mills: 50000 })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    const res = await client.api.credits.$get(
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
    await expect(res.json()).resolves.toEqual({
      balance_mills: 50000,
      payment_method: null,
    })
  })

  test('returns organization balance', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await db
      .updateTable('organization')
      .set({ balance_mills: 30000 })
      .where('id', '=', org.id)
      .execute()
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'owner',
    })

    const res = await client.api.credits.$get(
      {},
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
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      balance_mills: 30000,
      payment_method: null,
    })
  })

  test('returns balance with payment_method when card exists', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: 'cus_test_pm' })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    fetchMock
      .get('https://api.stripe.com')
      .intercept({
        method: 'GET',
        path: '/v1/payment_methods?customer=cus_test_pm&type=card&limit=1',
      })
      .reply(
        200,
        {
          object: 'list',
          data: [
            {
              id: 'pm_test',
              object: 'payment_method',
              card: { brand: 'visa', last4: '4242' },
            },
          ],
        },
        { headers: { 'content-type': 'application/json' } },
      )

    const res = await client.api.credits.$get(
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
    await expect(res.json()).resolves.toEqual({
      balance_mills: 0,
      payment_method: { brand: 'visa', last4: '4242' },
    })
  })

  test('returns balance with null payment_method when no cards on file', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: 'cus_test_empty' })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    fetchMock
      .get('https://api.stripe.com')
      .intercept({
        method: 'GET',
        path: '/v1/payment_methods?customer=cus_test_empty&type=card&limit=1',
      })
      .reply(
        200,
        { object: 'list', data: [] },
        { headers: { 'content-type': 'application/json' } },
      )

    const res = await client.api.credits.$get(
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
    await expect(res.json()).resolves.toEqual({
      balance_mills: 0,
      payment_method: null,
    })
  })
})

describe('POST /api/credits/add', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await client.api.credits.add.$post({
      json: { amount: '500' },
    })
    expect(res.status).toBe(401)
  })

  test('creates payment intent for account', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    fetchMock
      .get('https://api.stripe.com')
      .intercept({ method: 'POST', path: '/v1/customers' })
      .reply(
        200,
        { id: 'cus_test_123', object: 'customer' },
        { headers: { 'content-type': 'application/json' } },
      )
    fetchMock
      .get('https://api.stripe.com')
      .intercept({ method: 'POST', path: '/v1/payment_intents' })
      .reply(
        200,
        {
          id: 'pi_test_123',
          object: 'payment_intent',
          client_secret: 'pi_test_123_secret',
        },
        { headers: { 'content-type': 'application/json' } },
      )
    fetchMock
      .get('https://api.stripe.com')
      .intercept({ method: 'POST', path: '/v1/customer_sessions' })
      .reply(
        200,
        { client_secret: 'cs_session_test_123', object: 'customer_session' },
        { headers: { 'content-type': 'application/json' } },
      )

    const res = await client.api.credits.add.$post(
      { json: { amount: '500' } },
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
    const json = await res.json()
    assert('payment_id' in json, 'expected payment_id')
    expect(json.payment_id).toEqual(expect.any(String))
    expect(json.url).toMatch(/^https:\/\/curl\.local\/credits\/add\//)

    const kvData = await env.KV.get(`payment:${json.payment_id}`, 'json')
    expect(kvData).toBeTruthy()

    const updated = await db
      .selectFrom('account')
      .where('id', '=', account.id)
      .select('stripe_customer_id')
      .executeTakeFirstOrThrow()
    expect(updated.stripe_customer_id).toBe('cus_test_123')
  })

  test('creates payment intent with save flag', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: 'cus_save_test' })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    fetchMock
      .get('https://api.stripe.com')
      .intercept({ method: 'POST', path: '/v1/payment_intents' })
      .reply(
        200,
        {
          id: 'pi_save_123',
          object: 'payment_intent',
          client_secret: 'pi_save_123_secret',
        },
        { headers: { 'content-type': 'application/json' } },
      )
    fetchMock
      .get('https://api.stripe.com')
      .intercept({ method: 'POST', path: '/v1/customer_sessions' })
      .reply(
        200,
        { client_secret: 'cs_save_session_123', object: 'customer_session' },
        { headers: { 'content-type': 'application/json' } },
      )

    const res = await client.api.credits.add.$post(
      { json: { amount: '1000', save: true } },
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
    const json = await res.json()
    assert('payment_id' in json, 'expected payment_id')
    expect(json.payment_id).toEqual(expect.any(String))
    expect(json.url).toMatch(/^https:\/\/curl\.local\/credits\/add\//)
  })

  test('returns 403 for org when not owner/admin', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'member',
    })

    const res = await client.api.credits.add.$post(
      { json: { amount: '500', organization_id: org.id } },
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
    expect(res.status).toBe(403)
  })
})

describe('POST /api/credits/charge', () => {
  test('returns 401 when unauthenticated', async () => {
    const res = await client.api.credits.charge.$post({
      json: { amount: '1000' },
    })
    expect(res.status).toBe(401)
  })

  test('returns 400 when no stripe customer', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    const res = await client.api.credits.charge.$post(
      { json: { amount: '1000' } },
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
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'no_payment_method' })
  })

  test('returns 400 when no payment methods on file', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: 'cus_test_no_cards' })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    fetchMock
      .get('https://api.stripe.com')
      .intercept({
        method: 'GET',
        path: '/v1/payment_methods?customer=cus_test_no_cards&type=card&limit=1',
      })
      .reply(
        200,
        { data: [], object: 'list' },
        { headers: { 'content-type': 'application/json' } },
      )

    const res = await client.api.credits.charge.$post(
      { json: { amount: '1000' } },
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
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'no_payment_method' })
  })

  test('charges saved card successfully', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: 'cus_test_charge' })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    fetchMock
      .get('https://api.stripe.com')
      .intercept({
        method: 'GET',
        path: '/v1/payment_methods?customer=cus_test_charge&type=card&limit=1',
      })
      .reply(
        200,
        {
          data: [{ id: 'pm_test', card: { brand: 'visa', last4: '4242' } }],
          object: 'list',
        },
        { headers: { 'content-type': 'application/json' } },
      )
    fetchMock
      .get('https://api.stripe.com')
      .intercept({ method: 'POST', path: '/v1/payment_intents' })
      .reply(
        200,
        { id: 'pi_charge_test', status: 'succeeded', object: 'payment_intent' },
        { headers: { 'content-type': 'application/json' } },
      )

    const res = await client.api.credits.charge.$post(
      { json: { amount: '1000' } },
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
    await expect(res.json()).resolves.toEqual({
      payment_id: 'pi_charge_test',
      status: 'succeeded',
    })
  })

  test('returns requires_action with fallback URL when 3DS required', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: 'cus_test_3ds' })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    fetchMock
      .get('https://api.stripe.com')
      .intercept({
        method: 'GET',
        path: '/v1/payment_methods?customer=cus_test_3ds&type=card&limit=1',
      })
      .reply(
        200,
        {
          data: [{ id: 'pm_3ds', card: { brand: 'visa', last4: '4242' } }],
          object: 'list',
        },
        { headers: { 'content-type': 'application/json' } },
      )
    fetchMock
      .get('https://api.stripe.com')
      .intercept({ method: 'POST', path: '/v1/payment_intents' })
      .reply(
        200,
        {
          id: 'pi_3ds_test',
          status: 'requires_action',
          client_secret: 'pi_3ds_secret',
          object: 'payment_intent',
        },
        { headers: { 'content-type': 'application/json' } },
      )
    fetchMock
      .get('https://api.stripe.com')
      .intercept({ method: 'POST', path: '/v1/customer_sessions' })
      .reply(
        200,
        { client_secret: 'cs_3ds_session', object: 'customer_session' },
        { headers: { 'content-type': 'application/json' } },
      )

    const res = await client.api.credits.charge.$post(
      { json: { amount: '1000' } },
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
    const json = await res.json()
    assert('payment_id' in json, 'expected payment_id')
    expect(json).toEqual({
      payment_id: expect.any(String),
      status: 'requires_action',
      url: expect.stringContaining('/credits/add/'),
    })

    const kvData = await env.KV.get(`payment:${json.payment_id}`, 'json')
    expect(kvData).toBeTruthy()
  })

  test('returns 403 for org when not owner/admin', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'member',
    })

    const res = await client.api.credits.charge.$post(
      { json: { amount: '500', organization_id: org.id } },
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
    expect(res.status).toBe(403)
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
    const json = await res.json()
    assert('api_key' in json, 'expected api_key')
    expect(json.api_key.name).toBe('test token')
    expect(json.api_key.token.startsWith('curl_')).toBe(true)
    expect(json.api_key.key_prefix).toBe(json.api_key.token.slice(0, 14))

    const stored = await db
      .selectFrom('api_key')
      .where('id', '=', json.api_key.id)
      .select('key_hash')
      .executeTakeFirstOrThrow()
    const expectedHash = await ApiKey.hash(json.api_key.token)
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
    const json = await res.json()
    assert('api_key' in json, 'expected api_key')
    expect(json.api_key.organization_id).toBe(org.id)
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
    const json = await res.json()
    expect(json).toEqual({ error: 'name_taken' })
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
    const json = (await res.json()) as Extract<
      Awaited<ReturnType<typeof res.json>>,
      { api_keys: unknown }
    >
    expect(json.api_keys).toHaveLength(2)
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
    const json = (await res.json()) as Extract<
      Awaited<ReturnType<typeof res.json>>,
      { api_keys: unknown }
    >
    expect(json.api_keys).toHaveLength(1)
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

test('GET /api/stats returns cached value from KV', async () => {
  await env.KV.put('stats:tokens_saved', '42000')
  const res = await client.api.stats.$get()
  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ tokens_saved: 42000 })
})

test('GET /api/stats falls back to DB when KV is empty', async () => {
  await env.KV.delete('stats:tokens_saved')
  const res = await client.api.stats.$get()
  expect(res.status).toBe(200)
  const json = await res.json()
  expect(json).toHaveProperty('tokens_saved')
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
    const json = await res.json()
    assert(!('error' in json), 'expected organizations')
    expect(json.organizations).toHaveLength(2)
    expect(json.organizations).toEqual(
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
    const json = await res.json()
    assert(!('error' in json), 'expected organization')
    expect(json.organization).toEqual(
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
      content: 'ok',
      meta: {
        site: 'rl-query.example.com',
        url: 'https://rl-query.example.com/',
      },
    }),
  )
  await env.KV.put('query:https://rl-query.example.com/:test::smart', 'ok')

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-query.example.com' }, query: { q: 'test' } },
    { headers: { 'cf-connecting-ip': '10.0.0.3' } },
  )
  expect(res.status).toBe(200)
  expect(res.headers.get('x-ratelimit-limit')).toBe('3')
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

test('GET /api/:url authed 429 includes credits message', async () => {
  const account = await factory.account.insert({})
  const session = await factory.session.insert({ account_id: account.id })

  await env.KV.put(
    `ratelimit:fetch:${account.id}`,
    JSON.stringify({
      count: 1000,
      reset: Math.floor(Date.now() / 1000) + 3600,
    }),
    { expirationTtl: 3600 },
  )

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-authed-exceeded.example.com' }, query: {} },
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
  expect(res.status).toBe(429)
  const json = await res.json()
  expect(json).toEqual({
    error: 'rate_limit_exceeded',
    message: 'Add credits to remove rate limits',
  })
})

test('GET /api/:url paid user skips rate limits', async () => {
  const account = await factory.account.insert({})
  const session = await factory.session.insert({ account_id: account.id })

  // Seed balance cache
  await env.KV.put(`balance:${account.id}`, '1000')

  // Seed rate limit to already exceeded
  await env.KV.put(
    `ratelimit:fetch:${account.id}`,
    JSON.stringify({
      count: 1000,
      reset: Math.floor(Date.now() / 1000) + 3600,
    }),
    { expirationTtl: 3600 },
  )

  fetchMock
    .get('https://rl-paid.example.com')
    .intercept({ path: '/' })
    .reply(200, '<html><body><p>ok</p></body></html>', {
      headers: { 'content-type': 'text/html' },
    })

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-paid.example.com' }, query: {} },
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
  // Paid user should NOT get 429 even though rate limit is exceeded
  expect(res.status).toBe(200)
  // Should not have rate limit headers
  expect(res.headers.get('x-ratelimit-limit')).toBeNull()
})

test('GET /api/:url zero balance user gets authed rate limits', async () => {
  const account = await factory.account.insert({})
  const session = await factory.session.insert({ account_id: account.id })

  // Seed balance cache with 0
  await env.KV.put(`balance:${account.id}`, '0')

  fetchMock
    .get('https://rl-zero-bal.example.com')
    .intercept({ path: '/' })
    .reply(200, '<html><body><p>ok</p></body></html>', {
      headers: { 'content-type': 'text/html' },
    })

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-zero-bal.example.com' }, query: {} },
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
  // Should have authed rate limit headers (1000 for fetch)
  expect(res.headers.get('x-ratelimit-limit')).toBe('1000')
})

test('GET /api/:url paid user gets x-credits-remaining header', async () => {
  const account = await factory.account.insert({})
  const session = await factory.session.insert({ account_id: account.id })

  await env.KV.put(`balance:${account.id}`, '500')

  fetchMock
    .get('https://rl-credits.example.com')
    .intercept({ path: '/' })
    .reply(200, '<html><body><p>ok</p></body></html>', {
      headers: { 'content-type': 'text/html' },
    })

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-credits.example.com' }, query: {} },
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
  // fetch costs 1 mill, so 500 - 1 = 499
  expect(res.headers.get('x-credits-remaining')).toBe('499')
})

test('GET /api/:url query request cost scales with input size', async () => {
  const account = await factory.account.insert({})
  const session = await factory.session.insert({ account_id: account.id })
  await env.KV.put(`balance:${account.id}`, '100')

  await env.KV.put(
    'page:https://cost-query.example.com/',
    JSON.stringify({
      content: 'ok',
      meta: {
        site: 'cost-query.example.com',
        url: 'https://cost-query.example.com/',
      },
    }),
  )
  await env.KV.put('query:https://cost-query.example.com/:test::smart', 'ok')

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'cost-query.example.com' }, query: { q: 'test' } },
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
  // cached query: inputChars=0, cost = 1 + ceil(0/4000) = 1 mill, so 100 - 1 = 99
  expect(res.headers.get('x-cost-mills')).toBe('1')
  expect(res.headers.get('x-credits-remaining')).toBe('99')
})

describe('GET /api/invites/:token', () => {
  test('returns invite preview', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'owner',
    })
    const invite = await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: account.id,
      role: 'member',
    })

    const res = await client.api.invites[':token'].$get({
      param: { token: invite.token },
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    assert('invite' in json, 'expected invite')
    expect(json.invite.organization.login).toBe(org.login)
    expect(json.invite.organization.name).toBe(org.name)
    expect(json.invite.role).toBe('member')
  })

  test('returns 404 when expired', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'owner',
    })
    const invite = await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: account.id,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    })

    const res = await client.api.invites[':token'].$get({
      param: { token: invite.token },
    })
    expect(res.status).toBe(404)
  })

  test('returns 404 when deleted', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'owner',
    })
    const invite = await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: account.id,
      deleted_at: new Date().toISOString(),
    })

    const res = await client.api.invites[':token'].$get({
      param: { token: invite.token },
    })
    expect(res.status).toBe(404)
  })

  test('returns 404 when exhausted', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'owner',
    })
    const invite = await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: account.id,
      max_uses: 1,
      use_count: 1,
    })

    const res = await client.api.invites[':token'].$get({
      param: { token: invite.token },
    })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/invites/:token/accept', () => {
  test('accepts invite and creates membership', async () => {
    const owner = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })
    const invite = await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: owner.id,
      role: 'member',
    })

    const joiner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: joiner.id })

    const res = await client.api.invites[':token'].accept.$post(
      { param: { token: invite.token } },
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
    const json = await res.json()
    assert('organization' in json, 'expected organization')
    expect(json.organization.id).toBe(org.id)
    expect(json.organization.login).toBe(org.login)

    const membership = await db
      .selectFrom('organization_member')
      .where('organization_id', '=', org.id)
      .where('account_id', '=', joiner.id)
      .selectAll()
      .executeTakeFirstOrThrow()
    expect(membership.role).toBe('member')

    const updated = await db
      .selectFrom('organization_invite')
      .where('id', '=', invite.id)
      .select('use_count')
      .executeTakeFirstOrThrow()
    expect(updated.use_count).toBe(1)
  })

  test('returns 401 when unauthenticated', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'owner',
    })
    const invite = await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: account.id,
    })

    const res = await client.api.invites[':token'].accept.$post({
      param: { token: invite.token },
    })
    expect(res.status).toBe(401)
  })

  test('returns 404 when expired', async () => {
    const owner = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })
    const invite = await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: owner.id,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    })

    const joiner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: joiner.id })

    const res = await client.api.invites[':token'].accept.$post(
      { param: { token: invite.token } },
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

  test('returns 404 when deleted', async () => {
    const owner = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })
    const invite = await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: owner.id,
      deleted_at: new Date().toISOString(),
    })

    const joiner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: joiner.id })

    const res = await client.api.invites[':token'].accept.$post(
      { param: { token: invite.token } },
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

  test('returns 404 when exhausted', async () => {
    const owner = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })
    const invite = await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: owner.id,
      max_uses: 1,
      use_count: 1,
    })

    const joiner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: joiner.id })

    const res = await client.api.invites[':token'].accept.$post(
      { param: { token: invite.token } },
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

  test('returns 409 when already a member', async () => {
    const owner = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })
    const invite = await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: owner.id,
    })

    const joiner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: joiner.id })
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: joiner.id,
      role: 'member',
    })

    const res = await client.api.invites[':token'].accept.$post(
      { param: { token: invite.token } },
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
    await expect(res.json()).resolves.toEqual({ error: 'already_member' })

    const updated = await db
      .selectFrom('organization_invite')
      .where('id', '=', invite.id)
      .select('use_count')
      .executeTakeFirstOrThrow()
    expect(updated.use_count).toBe(0)
  })
})

describe('POST /api/orgs/:id/invites', () => {
  test('creates invite as owner', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'owner',
    })

    const res = await client.api.orgs[':id'].invites.$post(
      { param: { id: org.id }, json: {} },
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
    expect(res.status).toBe(201)
    const json = await res.json()
    assert('invite' in json, 'expected invite')
    expect(json.invite.token).toBeTruthy()
    expect(json.invite.url).toContain(`/invite/${json.invite.token}`)
    expect(json.invite.role).toBe('member')
    expect(json.invite.expires_at).toBeTruthy()
    expect(json.invite.max_uses).toBeNull()
  })

  test('returns 401 when unauthenticated', async () => {
    const org = await factory.organization.insert({})
    const res = await client.api.orgs[':id'].invites.$post({
      param: { id: org.id },
      json: {},
    })
    expect(res.status).toBe(401)
  })

  test('returns 403 when not owner/admin', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'member',
    })

    const res = await client.api.orgs[':id'].invites.$post(
      { param: { id: org.id }, json: {} },
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
    expect(res.status).toBe(403)
  })

  test('custom role, max_uses, expires_in', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'owner',
    })

    const res = await client.api.orgs[':id'].invites.$post(
      {
        param: { id: org.id },
        json: { role: 'admin', max_uses: 5, expires_in: 3600 },
      },
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
    expect(res.status).toBe(201)
    const json = await res.json()
    assert('invite' in json, 'expected invite')
    expect(json.invite.role).toBe('admin')
    expect(json.invite.max_uses).toBe(5)
  })
})

describe('GET /api/orgs/:id/invites', () => {
  test('returns 401 when unauthenticated', async () => {
    const org = await factory.organization.insert({})
    const res = await client.api.orgs[':id'].invites.$get({
      param: { id: org.id },
    })
    expect(res.status).toBe(401)
  })

  test('lists invites for org as owner', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'owner',
    })
    await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: account.id,
    })
    await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: account.id,
    })

    const res = await client.api.orgs[':id'].invites.$get(
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
    const json = await res.json()
    assert('invites' in json, 'expected invites')
    expect(json.invites).toHaveLength(2)
  })

  test('excludes soft-deleted invites', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'owner',
    })
    await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: account.id,
    })
    await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: account.id,
      deleted_at: new Date().toISOString(),
    })

    const res = await client.api.orgs[':id'].invites.$get(
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
    const json = await res.json()
    assert('invites' in json, 'expected invites')
    expect(json.invites).toHaveLength(1)
  })

  test('returns 403 when not owner/admin', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'member',
    })

    const res = await client.api.orgs[':id'].invites.$get(
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
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/orgs/:id/invites/:inviteId', () => {
  test('returns 401 when unauthenticated', async () => {
    const org = await factory.organization.insert({})
    const res = await client.api.orgs[':id'].invites[':inviteId'].$delete({
      param: { id: org.id, inviteId: 'some-id' },
    })
    expect(res.status).toBe(401)
  })

  test('revokes invite', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'owner',
    })
    const invite = await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: account.id,
    })

    const res = await client.api.orgs[':id'].invites[':inviteId'].$delete(
      { param: { id: org.id, inviteId: invite.id } },
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
    await expect(res.json()).resolves.toEqual({ ok: true })

    const row = await db
      .selectFrom('organization_invite')
      .where('id', '=', invite.id)
      .select('deleted_at')
      .executeTakeFirstOrThrow()
    expect(row.deleted_at).not.toBeNull()
  })

  test('returns 404 when invite does not exist', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'owner',
    })

    const res = await client.api.orgs[':id'].invites[':inviteId'].$delete(
      { param: { id: org.id, inviteId: 'nonexistent' } },
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

  test('returns 403 when not owner/admin', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'member',
    })
    const owner = await factory.account.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })
    const invite = await factory.organization_invite.insert({
      organization_id: org.id,
      created_by: owner.id,
    })

    const res = await client.api.orgs[':id'].invites[':inviteId'].$delete(
      { param: { id: org.id, inviteId: invite.id } },
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
    expect(res.status).toBe(403)
  })
})

describe('GET /api/orgs/:id/members', () => {
  test('lists members as owner', async () => {
    const owner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: owner.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })
    const member = await factory.account.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: member.id,
      role: 'member',
    })

    const res = await client.api.orgs[':id'].members.$get(
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
    const json = await res.json()
    assert('members' in json, 'expected members')
    expect(json.members).toHaveLength(2)
    expect(json.members[0]).toMatchObject({
      login: owner.login,
      name: owner.name,
      email: owner.email,
      role: 'owner',
    })
    expect(json.members[0]!.id).toBeDefined()
    expect(json.members[0]!.created_at).toBeDefined()
    expect(json.members[1]).toMatchObject({
      login: member.login,
      role: 'member',
    })
  })

  test('lists members as admin', async () => {
    const admin = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: admin.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: admin.id,
      role: 'admin',
    })

    const res = await client.api.orgs[':id'].members.$get(
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
    const json = await res.json()
    assert('members' in json, 'expected members')
    expect(json.members).toHaveLength(1)
  })

  test('returns 401 when unauthenticated', async () => {
    const org = await factory.organization.insert({})
    const res = await client.api.orgs[':id'].members.$get({
      param: { id: org.id },
    })
    expect(res.status).toBe(401)
  })

  test('returns 403 when regular member', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'member',
    })

    const res = await client.api.orgs[':id'].members.$get(
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
    expect(res.status).toBe(403)
  })

  test('returns 403 when not a member', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})

    const res = await client.api.orgs[':id'].members.$get(
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
    expect(res.status).toBe(403)
  })
})

describe('POST /api/orgs/:id/members', () => {
  test('adds member as owner', async () => {
    const owner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: owner.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })
    const target = await factory.account.insert({})

    const res = await client.api.orgs[':id'].members.$post(
      { param: { id: org.id }, json: { login: target.login, role: 'member' } },
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
    expect(res.status).toBe(201)
    const json = await res.json()
    assert('member' in json, 'expected member')
    expect(json.member.login).toBe(target.login)
    expect(json.member.role).toBe('member')

    const dbMember = await db
      .selectFrom('organization_member')
      .where('organization_id', '=', org.id)
      .where('account_id', '=', target.id)
      .select('role')
      .executeTakeFirst()
    expect(dbMember?.role).toBe('member')
  })

  test('adds member as admin with member role', async () => {
    const admin = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: admin.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: admin.id,
      role: 'admin',
    })
    const target = await factory.account.insert({})

    const res = await client.api.orgs[':id'].members.$post(
      { param: { id: org.id }, json: { login: target.login, role: 'member' } },
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
    expect(res.status).toBe(201)
    const json = await res.json()
    assert('member' in json, 'expected member')
    expect(json.member.role).toBe('member')
  })

  test('returns 403 when admin assigns admin role', async () => {
    const admin = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: admin.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: admin.id,
      role: 'admin',
    })
    const target = await factory.account.insert({})

    const res = await client.api.orgs[':id'].members.$post(
      { param: { id: org.id }, json: { login: target.login, role: 'admin' } },
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
    expect(res.status).toBe(403)
  })

  test('owner can assign admin role', async () => {
    const owner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: owner.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })
    const target = await factory.account.insert({})

    const res = await client.api.orgs[':id'].members.$post(
      { param: { id: org.id }, json: { login: target.login, role: 'admin' } },
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
    expect(res.status).toBe(201)
    const json = await res.json()
    assert('member' in json, 'expected member')
    expect(json.member.role).toBe('admin')
  })

  test('returns 401 when unauthenticated', async () => {
    const org = await factory.organization.insert({})
    const target = await factory.account.insert({})
    const res = await client.api.orgs[':id'].members.$post({
      param: { id: org.id },
      json: { login: target.login, role: 'member' },
    })
    expect(res.status).toBe(401)
  })

  test('returns 403 when regular member', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'member',
    })
    const target = await factory.account.insert({})

    const res = await client.api.orgs[':id'].members.$post(
      { param: { id: org.id }, json: { login: target.login, role: 'member' } },
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
    expect(res.status).toBe(403)
  })

  test('returns 404 when account not found', async () => {
    const owner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: owner.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })

    const res = await client.api.orgs[':id'].members.$post(
      {
        param: { id: org.id },
        json: { login: 'nonexistent_login', role: 'member' },
      },
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

  test('returns 409 when already a member', async () => {
    const owner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: owner.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })
    const target = await factory.account.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: target.id,
      role: 'member',
    })

    const res = await client.api.orgs[':id'].members.$post(
      { param: { id: org.id }, json: { login: target.login, role: 'member' } },
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
  })
})

describe('PATCH /api/orgs/:id/members/:memberId', () => {
  test('owner changes member to admin', async () => {
    const owner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: owner.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })
    const target = await factory.account.insert({})
    const targetMember = await factory.organization_member.insert({
      organization_id: org.id,
      account_id: target.id,
      role: 'member',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$patch(
      {
        param: { id: org.id, memberId: targetMember.id },
        json: { role: 'admin' },
      },
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
    await expect(res.json()).resolves.toEqual({ ok: true })

    const dbMember = await db
      .selectFrom('organization_member')
      .where('id', '=', targetMember.id)
      .select('role')
      .executeTakeFirst()
    expect(dbMember?.role).toBe('admin')
  })

  test('admin changes member to admin', async () => {
    const admin = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: admin.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: admin.id,
      role: 'admin',
    })
    const target = await factory.account.insert({})
    const targetMember = await factory.organization_member.insert({
      organization_id: org.id,
      account_id: target.id,
      role: 'member',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$patch(
      {
        param: { id: org.id, memberId: targetMember.id },
        json: { role: 'admin' },
      },
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
  })

  test('admin changes admin to member', async () => {
    const admin = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: admin.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: admin.id,
      role: 'admin',
    })
    const otherAdmin = await factory.account.insert({})
    const otherAdminMember = await factory.organization_member.insert({
      organization_id: org.id,
      account_id: otherAdmin.id,
      role: 'admin',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$patch(
      {
        param: { id: org.id, memberId: otherAdminMember.id },
        json: { role: 'member' },
      },
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

    const dbMember = await db
      .selectFrom('organization_member')
      .where('id', '=', otherAdminMember.id)
      .select('role')
      .executeTakeFirst()
    expect(dbMember?.role).toBe('member')
  })

  test('returns 401 when unauthenticated', async () => {
    const org = await factory.organization.insert({})
    const res = await client.api.orgs[':id'].members[':memberId'].$patch({
      param: { id: org.id, memberId: 'nonexistent' },
      json: { role: 'admin' },
    })
    expect(res.status).toBe(401)
  })

  test('returns 403 when regular member', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'member',
    })
    const target = await factory.account.insert({})
    const targetMember = await factory.organization_member.insert({
      organization_id: org.id,
      account_id: target.id,
      role: 'member',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$patch(
      {
        param: { id: org.id, memberId: targetMember.id },
        json: { role: 'admin' },
      },
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
    expect(res.status).toBe(403)
  })

  test('returns 403 when changing own role', async () => {
    const owner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: owner.id })
    const org = await factory.organization.insert({})
    const ownerMember = await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$patch(
      {
        param: { id: org.id, memberId: ownerMember.id },
        json: { role: 'admin' },
      },
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
    expect(res.status).toBe(403)
  })

  test('returns 403 when changing owner role', async () => {
    const admin = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: admin.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: admin.id,
      role: 'admin',
    })
    const owner = await factory.account.insert({})
    const ownerMember = await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$patch(
      {
        param: { id: org.id, memberId: ownerMember.id },
        json: { role: 'member' },
      },
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
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'cannot_change_owner' })
  })

  test('returns 404 when member not found', async () => {
    const owner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: owner.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$patch(
      {
        param: { id: org.id, memberId: 'nonexistent' },
        json: { role: 'admin' },
      },
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

describe('DELETE /api/orgs/:id/members/:memberId', () => {
  test('owner removes member', async () => {
    const owner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: owner.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })
    const target = await factory.account.insert({})
    const targetMember = await factory.organization_member.insert({
      organization_id: org.id,
      account_id: target.id,
      role: 'member',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$delete(
      { param: { id: org.id, memberId: targetMember.id } },
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
    await expect(res.json()).resolves.toEqual({ ok: true })

    const dbMember = await db
      .selectFrom('organization_member')
      .where('id', '=', targetMember.id)
      .executeTakeFirst()
    expect(dbMember).toBeUndefined()
  })

  test('admin removes member', async () => {
    const admin = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: admin.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: admin.id,
      role: 'admin',
    })
    const target = await factory.account.insert({})
    const targetMember = await factory.organization_member.insert({
      organization_id: org.id,
      account_id: target.id,
      role: 'member',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$delete(
      { param: { id: org.id, memberId: targetMember.id } },
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
  })

  test('admin removes admin', async () => {
    const admin = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: admin.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: admin.id,
      role: 'admin',
    })
    const otherAdmin = await factory.account.insert({})
    const otherAdminMember = await factory.organization_member.insert({
      organization_id: org.id,
      account_id: otherAdmin.id,
      role: 'admin',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$delete(
      { param: { id: org.id, memberId: otherAdminMember.id } },
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

    const dbMember = await db
      .selectFrom('organization_member')
      .where('id', '=', otherAdminMember.id)
      .executeTakeFirst()
    expect(dbMember).toBeUndefined()
  })

  test('returns 401 when unauthenticated', async () => {
    const org = await factory.organization.insert({})
    const res = await client.api.orgs[':id'].members[':memberId'].$delete({
      param: { id: org.id, memberId: 'nonexistent' },
    })
    expect(res.status).toBe(401)
  })

  test('returns 403 when regular member', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'member',
    })
    const target = await factory.account.insert({})
    const targetMember = await factory.organization_member.insert({
      organization_id: org.id,
      account_id: target.id,
      role: 'member',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$delete(
      { param: { id: org.id, memberId: targetMember.id } },
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
    expect(res.status).toBe(403)
  })

  test('returns 403 when removing self', async () => {
    const owner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: owner.id })
    const org = await factory.organization.insert({})
    const ownerMember = await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$delete(
      { param: { id: org.id, memberId: ownerMember.id } },
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
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'cannot_remove_self' })
  })

  test('returns 403 when removing owner', async () => {
    const admin = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: admin.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: admin.id,
      role: 'admin',
    })
    const owner = await factory.account.insert({})
    const ownerMember = await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$delete(
      { param: { id: org.id, memberId: ownerMember.id } },
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
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'cannot_remove_owner' })
  })

  test('returns 404 when member not found', async () => {
    const owner = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: owner.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: owner.id,
      role: 'owner',
    })

    const res = await client.api.orgs[':id'].members[':memberId'].$delete(
      { param: { id: org.id, memberId: 'nonexistent' } },
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

describe('POST /api/stripe/webhook', () => {
  test('returns 400 when signature missing', async () => {
    const res = await api.request(
      '/api/stripe/webhook',
      {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      },
      env,
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'missing_signature' })
  })

  test('returns 400 when signature invalid', async () => {
    const res = await api.request(
      '/api/stripe/webhook',
      {
        method: 'POST',
        body: '{}',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'invalid_sig',
        },
      },
      env,
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'invalid_signature' })
  })

  test('accepts valid signature and queues event', async () => {
    const payload = JSON.stringify({
      id: 'evt_test_valid',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_valid',
          amount_total: 500,
          customer: 'cus_test_valid',
        },
      },
    })

    // Compute HMAC signature (async-safe for Workers)
    const timestamp = Math.floor(Date.now() / 1000)
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${timestamp}.${payload}`),
    )
    const hex = [...new Uint8Array(sig)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const header = `t=${timestamp},v1=${hex}`

    const res = await api.request(
      '/api/stripe/webhook',
      {
        method: 'POST',
        body: payload,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': header,
        },
      },
      env,
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true })
  })
})
