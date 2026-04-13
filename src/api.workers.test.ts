import assert from 'node:assert'
import * as Sentry from '@sentry/cloudflare'
import { env } from 'cloudflare:workers'
import { testClient } from 'hono/testing'
import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest'
import { api } from '#api.ts'
import { createClient } from '#db/client.ts'
import * as ApiKey from '#lib/apiKey.ts'
import * as Constants from '#lib/constants.ts'
import * as Cookie from '#lib/cookie.ts'
import * as Crypto from '#lib/crypto.ts'
import * as Nanoid from '#lib/nanoid.ts'
import { createFactory } from '#test/factory.ts'
import { server } from '#test/workers.server.ts'

const db = createClient(env.DB.connectionString)
const factory = createFactory(db)

const executionCtx = {
  waitUntil: vi.fn((p: Promise<unknown>) => p),
  passThroughOnException: vi.fn(),
  props: {},
}
const client = testClient(api, env, executionCtx)
const clientOrigin = client.api.auth.device.confirm.$url().origin

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
    expect(new URL(redirectUri).searchParams.get('next')).toBe('https://pr10.curl.local')
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
      code: 'validation_error',
      message: expect.any(String),
      issues: expect.arrayContaining([{ path: expect.any(String), message: expect.any(String) }]),
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
    expect(location.searchParams.get('error_description')).toBe('State mismatch')
  })

  test('with bad code redirects to error page', async () => {
    const query = { code: 'bad', state: 'test-state' }

    server.use(
      http.post('https://github.com/login/oauth/access_token', () =>
        HttpResponse.json({
          error: 'bad_verification_code',
          error_description: 'Bad code',
          error_uri:
            'https://docs.github.com/apps/managing-oauth-apps/troubleshooting-oauth-app-access-token-request-errors/#bad-verification-code',
        }),
      ),
    )

    const res = await client.api.auth.github.callback.$get(
      { query },
      { headers: { Cookie: `curl.state=${query.state}` } },
    )
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/auth/error')
    expect(location.searchParams.get('error')).toBe('bad_verification_code')
    expect(location.searchParams.get('error_description')).toBe('Failed to get access token')
  })

  test('creates account and redirects to account login', async () => {
    const login = `user-${Nanoid.generate()}`
    const ghId = Math.floor(Math.random() * 1_000_000)
    const email = `${login}@example.com`
    const query = { code: 'good', state: 'test-state' }

    server.use(
      http.post('https://github.com/login/oauth/access_token', () =>
        HttpResponse.json({
          access_token: 'ghu_test123',
          scope: '',
          token_type: 'bearer',
        }),
      ),
      http.get('https://api.github.com/user', () =>
        HttpResponse.json({
          avatar_url: `https://avatars.githubusercontent.com/u/${ghId}`,
          id: ghId,
          login,
          name: 'Test User',
        }),
      ),
      http.get('https://api.github.com/user/emails', () =>
        HttpResponse.json([{ email, primary: true, verified: true }]),
      ),
    )

    const res = await client.api.auth.github.callback.$get(
      { query },
      { headers: { Cookie: `curl.state=${query.state}` } },
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`http://localhost/${login}`)
    expect(res.headers.getSetCookie().some((c) => c.startsWith('curl.session='))).toBe(true)

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
    const decrypted = await Crypto.decrypt(provider.access_token!, env.TOKEN_ENCRYPTION_KEY)
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

    server.use(
      http.post('https://github.com/login/oauth/access_token', () =>
        HttpResponse.json({
          access_token: 'ghu_existing',
          scope: '',
          token_type: 'bearer',
        }),
      ),
      http.get('https://api.github.com/user', () =>
        HttpResponse.json({
          avatar_url: `https://avatars.githubusercontent.com/u/${ghId}`,
          id: Number(ghId),
          login: account.login,
          name: 'Existing User',
        }),
      ),
      http.get('https://api.github.com/user/emails', () =>
        HttpResponse.json([{ email: account.email, primary: true, verified: true }]),
      ),
    )

    const res = await client.api.auth.github.callback.$get(
      { query },
      { headers: { Cookie: `curl.state=${query.state}` } },
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`http://localhost/${account.login}`)

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

    server.use(
      http.post('https://github.com/login/oauth/access_token', () =>
        HttpResponse.json({
          access_token: 'ghu_noemail',
          scope: '',
          token_type: 'bearer',
        }),
      ),
      http.get('https://api.github.com/user', () =>
        HttpResponse.json({
          avatar_url: `https://avatars.githubusercontent.com/u/${ghId}`,
          id: ghId,
          login: 'noemail-user',
          name: 'No Email',
        }),
      ),
      http.get('https://api.github.com/user/emails', () => HttpResponse.json([])),
    )

    const res = await client.api.auth.github.callback.$get(
      { query },
      { headers: { Cookie: `curl.state=${query.state}` } },
    )
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/auth/error')
    expect(location.searchParams.get('error')).toBe('no_email')
    expect(location.searchParams.get('error_description')).toBe('No email found on GitHub account')
  })

  test.todo('with transaction failure redirects to error page with server_error')
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

  test('full flow: create, confirm, exchange for refresh/access tokens', async () => {
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
          Origin: clientOrigin,
        },
      },
    )
    expect(confirmRes.status).toBe(200)
    await expect(confirmRes.json()).resolves.toEqual({ ok: true })

    // 3. Exchange device code for CLI refresh/access credentials
    const tokenRes = await client.api.auth.device.token.$post({
      json: { code: device.code },
    })
    expect(tokenRes.status).toBe(200)
    const tokenData = await tokenRes.json()
    assert('authorization' in tokenData, 'authorization not defined')
    assert('expires_at' in tokenData, 'expires_at not defined')
    assert('refresh_token' in tokenData, 'refresh_token not defined')
    assert('refresh_token_expires_at' in tokenData, 'refresh_token_expires_at not defined')
    expect(tokenData.authorization).toMatch(/^Bearer curlmd_at_/)
    expect(tokenData.expires_at).toEqual(expect.any(String))
    expect(tokenData.refresh_token).toMatch(/^curlmd_rt_/)
    expect(tokenData.refresh_token_expires_at).toEqual(expect.any(String))

    // 4. Verify the issued access token works
    const meRes = await client.api.auth.me.$get(
      {},
      {
        headers: {
          Authorization: tokenData.authorization,
        },
      },
    )
    expect(meRes.status).toBe(200)
    const meData = await meRes.json()
    expect(meData.account).not.toBeNull()
    expect(meData.account!.id).toBe(account.id)

    // 5. Verify refresh token mints a fresh access token
    const headersRes = await client.api.auth.headers.$post(
      {},
      {
        headers: {
          Authorization: `Bearer ${tokenData.refresh_token}`,
        },
      },
    )
    expect(headersRes.status).toBe(200)
    const headersData = await headersRes.json()
    assert('authorization' in headersData, 'authorization not defined')
    assert('expires_at' in headersData, 'expires_at not defined')
    expect(headersData.authorization).toMatch(/^Bearer curlmd_at_/)
    expect(headersData.expires_at).toEqual(expect.any(String))

    const refreshedMeRes = await client.api.auth.me.$get(
      {},
      {
        headers: {
          Authorization: headersData.authorization,
        },
      },
    )
    expect(refreshedMeRes.status).toBe(200)
    const refreshedMeData = await refreshedMeRes.json()
    expect(refreshedMeData.account?.id).toBe(account.id)

    // 6. Verify device code was consumed (deleted)
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
      code: 'validation_error',
      message: expect.any(String),
      issues: expect.arrayContaining([{ path: expect.any(String), message: expect.any(String) }]),
    })
  })

  test('without session returns 401', async () => {
    const res = await client.api.auth.device.confirm.$post(
      {
        json: { user_code: 'ABCD1234' },
      },
      {
        headers: { Origin: clientOrigin },
      },
    )
    expect(res.status).toBe(401)
  })

  test('with cross-origin request returns 403', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const deviceRes = await client.api.auth.device.$post()
    assert(deviceRes.status === 200, 'expected 200')
    const device = await deviceRes.json()

    const res = await client.api.auth.device.confirm.$post(
      { json: { user_code: device.user_code } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
          Origin: 'https://evil.example',
        },
      },
    )
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      code: 'invalid_origin',
      message: 'Request origin not allowed',
    })

    await expect(
      db
        .selectFrom('device_code')
        .where('code', '=', device.code)
        .select('status')
        .executeTakeFirst(),
    ).resolves.toEqual({ status: 'pending' })
  })

  test('with invalid code returns 404', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    const res = await client.api.auth.device.confirm.$post(
      { json: { user_code: 'INVALID1' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
          Origin: clientOrigin,
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
      code: 'validation_error',
      message: expect.any(String),
      issues: expect.arrayContaining([{ path: expect.any(String), message: expect.any(String) }]),
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
      code: 'authorization_pending',
      message: expect.any(String),
    })
  })

  test('polling invalid code returns expired_token', async () => {
    const res = await client.api.auth.device.token.$post({
      json: { code: 'nonexistent' },
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      code: 'expired_token',
      message: expect.any(String),
    })
  })

  test('approved code can only be redeemed once under concurrency', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const deviceRes = await client.api.auth.device.$post()
    assert(deviceRes.status === 200, 'expected 200')
    const device = await deviceRes.json()

    const confirmRes = await client.api.auth.device.confirm.$post(
      { json: { user_code: device.user_code } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
          Origin: clientOrigin,
        },
      },
    )
    expect(confirmRes.status).toBe(200)

    const results = await Promise.all([
      client.api.auth.device.token.$post({ json: { code: device.code } }),
      client.api.auth.device.token.$post({ json: { code: device.code } }),
    ])
    const statuses = results.map((res) => res.status)

    expect(statuses.filter((status) => status === 200)).toHaveLength(1)
    expect(statuses.filter((status) => status === 400)).toHaveLength(1)

    const bodies = await Promise.all(
      results.map(async (res) => ({ json: await res.json(), status: res.status })),
    )
    const failure = bodies.find((result) => result.status === 400)
    expect(failure?.json).toEqual({
      code: 'expired_token',
      message: expect.any(String),
    })

    const cliSessions = await db
      .selectFrom('session')
      .where('account_id', '=', account.id)
      .where('session_type', '=', 'cli')
      .select('id')
      .execute()
    expect(cliSessions).toHaveLength(1)
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
      code: 'rate_limit_exceeded',
      message: expect.any(String),
    })
  })
})

test('POST /api/auth/device returns 429 when rate limit exceeded', async () => {
  await env.KV.put(
    'ratelimit:device:192.0.2.11',
    JSON.stringify({ count: 15, reset: Math.floor(Date.now() / 1000) + 60 }),
    { expirationTtl: 60 },
  )

  const res = await client.api.auth.device.$post(
    {},
    { headers: { 'cf-connecting-ip': '192.0.2.11' } },
  )
  expect(res.status).toBe(429)
  expect(res.headers.get('retry-after')).toBeTruthy()
  await expect(res.json()).resolves.toEqual({
    code: 'rate_limit_exceeded',
    message: expect.any(String),
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
    const token = ApiKey.generate()
    const hash = await ApiKey.hash(token)
    await factory.api_key.insert({
      organization_id: org.id,
      account_id: account.id,
      key_hash: hash,
      key_prefix: token.slice(0, 14),
      name: 'test key',
    })

    const res = await client.api.auth.me.$get({}, { headers: { Authorization: `Bearer ${token}` } })
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
    const token = ApiKey.generate()
    const hash = await ApiKey.hash(token)
    await factory.api_key.insert({
      organization_id: org.id,
      account_id: account.id,
      key_hash: hash,
      key_prefix: token.slice(0, 14),
      name: 'deleted key',
      deleted_at: new Date().toISOString(),
    })

    const res = await client.api.auth.me.$get({}, { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({
      code: 'invalid_api_key',
      message: expect.any(String),
    })
  })

  test('resolves API key from token query param', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })
    const token = ApiKey.generate()
    const hash = await ApiKey.hash(token)
    await factory.api_key.insert({
      organization_id: org.id,
      account_id: account.id,
      key_hash: hash,
      key_prefix: token.slice(0, 14),
      name: 'query param key',
    })

    for (const param of ['token', 't']) {
      const res = await api.request(`/api/auth/me?${param}=${token}`, {}, env, executionCtx)
      expect(res.status).toBe(200)
      const json = (await res.json()) as { account: { id: string } | null }
      expect(json.account).not.toBeNull()
      expect(json.account!.id).toBe(account.id)
    }
  })

  test('updates last_used_at on API key use', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })
    const token = ApiKey.generate()
    const hash = await ApiKey.hash(token)
    const apiKey = await factory.api_key.insert({
      organization_id: org.id,
      account_id: account.id,
      key_hash: hash,
      key_prefix: token.slice(0, 14),
      name: 'lastused key',
    })

    await client.api.auth.me.$get({}, { headers: { Authorization: `Bearer ${token}` } })

    await vi.waitFor(async () => {
      const updated = await db
        .selectFrom('api_key')
        .where('id', '=', apiKey.id)
        .select('last_used_at')
        .executeTakeFirstOrThrow()
      expect(updated.last_used_at).not.toBeNull()
    })
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
      .set({ stripe_customer_id: `cus_${Nanoid.generate()}` })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({
          object: 'list',
          data: [
            {
              id: 'pm_test',
              object: 'payment_method',
              card: { brand: 'visa', last4: '4242' },
            },
          ],
        }),
      ),
    )

    const res = await client.api.credits.$get(
      {},
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
      .set({ stripe_customer_id: `cus_${Nanoid.generate()}` })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({ object: 'list', data: [] }),
      ),
    )

    const res = await client.api.credits.$get(
      {},
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      balance_mills: 0,
      payment_method: null,
    })
  })

  test('returns default payment_method when configured', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({
        default_payment_method_id: 'pm_default',
        stripe_customer_id: `cus_${Nanoid.generate()}`,
      })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({
          object: 'list',
          data: [
            {
              id: 'pm_other',
              object: 'payment_method',
              card: { brand: 'mastercard', last4: '4444' },
            },
            {
              id: 'pm_default',
              object: 'payment_method',
              card: { brand: 'visa', last4: '4242' },
            },
          ],
        }),
      ),
    )

    const res = await client.api.credits.$get(
      {},
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      balance_mills: 0,
      payment_method: { brand: 'visa', last4: '4242' },
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
    let customerSessionBody = ''
    const stripeVersions = new Set<string>()

    server.use(
      http.post('https://api.stripe.com/v1/customers', () =>
        HttpResponse.json({ id: 'cus_test_123', object: 'customer' }),
      ),
      http.get('https://api.stripe.com/v1/payment_methods', ({ request }) => {
        stripeVersions.add(request.headers.get('stripe-version') ?? '')
        return HttpResponse.json({ data: [], object: 'list' })
      }),
      http.post('https://api.stripe.com/v1/payment_intents', ({ request }) => {
        stripeVersions.add(request.headers.get('stripe-version') ?? '')
        return HttpResponse.json({
          id: 'pi_test_123',
          object: 'payment_intent',
          client_secret: 'pi_test_123_secret',
        })
      }),
      http.post('https://api.stripe.com/v1/customer_sessions', async ({ request }) => {
        stripeVersions.add(request.headers.get('stripe-version') ?? '')
        customerSessionBody = toSearchParams(await request.formData()).toString()
        return HttpResponse.json({
          client_secret: 'cs_test_dummy_secret',
          object: 'customer_session',
        })
      }),
    )

    const res = await client.api.credits.add.$post(
      { json: { amount: '500' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
    expect(customerSessionBody).toContain('payment_method_allow_redisplay_filters')
    expect(customerSessionBody).toContain('always')
    expect(customerSessionBody).toContain('limited')
    expect(customerSessionBody).toContain('unspecified')
    expect(stripeVersions).toEqual(new Set([Constants.stripeApiVersion]))
  })

  test('creates payment intent with save flag', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: `cus_${Nanoid.generate()}` })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({ data: [], object: 'list' }),
      ),
      http.post('https://api.stripe.com/v1/payment_intents', () =>
        HttpResponse.json({
          id: 'pi_save_123',
          object: 'payment_intent',
          client_secret: 'pi_save_123_secret',
        }),
      ),
      http.post('https://api.stripe.com/v1/customer_sessions', () =>
        HttpResponse.json({
          client_secret: 'cs_save_session_123',
          object: 'customer_session',
        }),
      ),
    )

    const res = await client.api.credits.add.$post(
      { json: { amount: '1000', save: true } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    assert('payment_id' in json, 'expected payment_id')
    expect(json.payment_id).toEqual(expect.any(String))
    expect(json.url).toMatch(/^https:\/\/curl\.local\/credits\/add\//)
  })

  test('returns payment_failed when payment intent has no client secret', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: `cus_${Nanoid.generate()}` })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({ data: [], object: 'list' }),
      ),
      http.post('https://api.stripe.com/v1/payment_intents', () =>
        HttpResponse.json({
          id: 'pi_missing_secret',
          object: 'payment_intent',
        }),
      ),
    )
    const beforeKeys = new Set(
      (await env.KV.list({ prefix: 'payment:' })).keys.map((key) => key.name),
    )

    const res = await client.api.credits.add.$post(
      { json: { amount: '500' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      code: 'payment_failed',
      message: 'Payment failed',
    })
    const afterKeys = new Set(
      (await env.KV.list({ prefix: 'payment:' })).keys.map((key) => key.name),
    )
    expect(afterKeys).toEqual(beforeKeys)
  })

  test('disables card saving when max payment methods already exist', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: `cus_${Nanoid.generate()}` })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    let customerSessionBody = ''
    let paymentIntentBody = ''

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({
          data: [
            { id: 'pm_1', card: { brand: 'visa', last4: '4242' } },
            { id: 'pm_2', card: { brand: 'visa', last4: '4243' } },
            { id: 'pm_3', card: { brand: 'visa', last4: '4244' } },
          ],
          object: 'list',
        }),
      ),
      http.post('https://api.stripe.com/v1/payment_intents', async ({ request }) => {
        paymentIntentBody = decodeURIComponent(toSearchParams(await request.formData()).toString())
        return HttpResponse.json({
          id: 'pi_save_limited',
          object: 'payment_intent',
          client_secret: 'pi_save_limited_secret',
        })
      }),
      http.post('https://api.stripe.com/v1/customer_sessions', async ({ request }) => {
        customerSessionBody = decodeURIComponent(
          toSearchParams(await request.formData()).toString(),
        )
        return HttpResponse.json({
          client_secret: 'cs_test_dummy_secret',
          object: 'customer_session',
        })
      }),
    )

    const res = await client.api.credits.add.$post(
      { json: { amount: '1000', save: true } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(200)
    expect(paymentIntentBody).not.toContain('setup_future_usage=off_session')
    expect(customerSessionBody).toContain('[payment_method_save]=disabled')
    expect(customerSessionBody).not.toContain('payment_method_save_usage')
  })

  test('falls back to legacy customer session features when Stripe rejects redisplay filters', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: `cus_${Nanoid.generate()}` })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    const customerSessionBodies: string[] = []

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({
          data: [{ id: 'pm_1', card: { brand: 'visa', last4: '4242' } }],
          object: 'list',
        }),
      ),
      http.post('https://api.stripe.com/v1/payment_intents', () =>
        HttpResponse.json({
          id: 'pi_retry_123',
          object: 'payment_intent',
          client_secret: 'pi_retry_123_secret',
        }),
      ),
      http.post('https://api.stripe.com/v1/customer_sessions', async ({ request }) => {
        customerSessionBodies.push(
          decodeURIComponent(toSearchParams(await request.formData()).toString()),
        )
        if (customerSessionBodies.length === 1)
          return HttpResponse.json(
            { error: { message: 'Unknown parameter: payment_method_allow_redisplay_filters' } },
            { status: 400 },
          )

        return HttpResponse.json({
          client_secret: 'cs_test_dummy_secret',
          object: 'customer_session',
        })
      }),
    )

    const res = await client.api.credits.add.$post(
      { json: { amount: '500' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    assert('payment_id' in json, 'expected payment_id')

    expect(customerSessionBodies).toHaveLength(2)
    expect(customerSessionBodies[0]).toContain('payment_method_allow_redisplay_filters')
    expect(customerSessionBodies[1]).not.toContain('payment_method_allow_redisplay_filters')

    const kvData = await env.KV.get(`payment:${json.payment_id}`, 'json')
    expect(kvData).toMatchObject({
      cs_secret: 'cs_test_dummy_secret',
      has_saved_payment_methods: true,
      saved_payment_methods_unavailable: false,
    })
  })

  test('flags saved methods as unavailable when customer session creation fails', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: `cus_${Nanoid.generate()}` })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({
          data: [{ id: 'pm_1', card: { brand: 'visa', last4: '4242' } }],
          object: 'list',
        }),
      ),
      http.post('https://api.stripe.com/v1/payment_intents', () =>
        HttpResponse.json({
          id: 'pi_flagged_123',
          object: 'payment_intent',
          client_secret: 'pi_flagged_123_secret',
        }),
      ),
      http.post('https://api.stripe.com/v1/customer_sessions', () =>
        HttpResponse.json({ error: { message: 'boom' } }, { status: 500 }),
      ),
    )

    const res = await client.api.credits.add.$post(
      { json: { amount: '500' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    assert('payment_id' in json, 'expected payment_id')

    const kvData = await env.KV.get(`payment:${json.payment_id}`, 'json')
    expect(kvData).toMatchObject({
      cs_secret: null,
      has_saved_payment_methods: true,
      saved_payment_methods_unavailable: true,
    })
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      code: 'no_payment_method',
      message: expect.any(String),
    })
  })

  test('returns 400 when no payment methods on file', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: `cus_${Nanoid.generate()}` })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({ data: [], object: 'list' }),
      ),
    )

    const res = await client.api.credits.charge.$post(
      { json: { amount: '1000' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      code: 'no_payment_method',
      message: expect.any(String),
    })
  })

  test('charges saved card successfully', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: `cus_${Nanoid.generate()}` })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({
          data: [{ id: 'pm_test', card: { brand: 'visa', last4: '4242' } }],
          object: 'list',
        }),
      ),
      http.post('https://api.stripe.com/v1/payment_intents', () =>
        HttpResponse.json({
          id: 'pi_charge_test',
          status: 'succeeded',
          object: 'payment_intent',
        }),
      ),
    )

    const res = await client.api.credits.charge.$post(
      { json: { amount: '1000' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      payment_id: 'pi_charge_test',
      status: 'succeeded',
    })
  })

  test('returns payment_failed when saved card is declined', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: `cus_${Nanoid.generate()}` })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({
          data: [{ id: 'pm_declined', card: { brand: 'visa', last4: '0019' } }],
          object: 'list',
        }),
      ),
      http.post('https://api.stripe.com/v1/payment_intents', () =>
        HttpResponse.json(
          {
            error: {
              code: 'card_declined',
              decline_code: 'fraudulent',
              message: 'Your card was declined.',
              type: 'card_error',
            },
          },
          { status: 402 },
        ),
      ),
    )

    const res = await client.api.credits.charge.$post(
      { json: { amount: '1000' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      code: 'payment_failed',
      message: 'Your card was declined as fraudulent. Try a different payment method.',
    })
  })

  test('charges default saved card when configured', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({
        default_payment_method_id: 'pm_default',
        stripe_customer_id: `cus_${Nanoid.generate()}`,
      })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    let paymentIntentBody = ''

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({
          data: [
            { id: 'pm_other', card: { brand: 'mastercard', last4: '4444' } },
            { id: 'pm_default', card: { brand: 'visa', last4: '4242' } },
          ],
          object: 'list',
        }),
      ),
      http.post('https://api.stripe.com/v1/payment_intents', async ({ request }) => {
        paymentIntentBody = toSearchParams(await request.formData()).toString()
        return HttpResponse.json({
          id: 'pi_charge_default',
          status: 'succeeded',
          object: 'payment_intent',
        })
      }),
    )

    const res = await client.api.credits.charge.$post(
      { json: { amount: '1000' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(200)
    expect(paymentIntentBody).toContain('payment_method=pm_default')
    await expect(res.json()).resolves.toEqual({
      payment_id: 'pi_charge_default',
      status: 'succeeded',
    })
  })

  test('repairs stale default payment method before charging', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({
        default_payment_method_id: 'pm_stale',
        stripe_customer_id: `cus_${Nanoid.generate()}`,
      })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    let paymentIntentBody = ''

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({
          data: [
            { id: 'pm_fallback', card: { brand: 'visa', last4: '4242' } },
            { id: 'pm_other', card: { brand: 'mastercard', last4: '4444' } },
          ],
          object: 'list',
        }),
      ),
      http.post('https://api.stripe.com/v1/payment_intents', async ({ request }) => {
        paymentIntentBody = toSearchParams(await request.formData()).toString()
        return HttpResponse.json({
          id: 'pi_charge_fallback',
          status: 'succeeded',
          object: 'payment_intent',
        })
      }),
    )

    const res = await client.api.credits.charge.$post(
      { json: { amount: '1000' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(200)
    expect(paymentIntentBody).toContain('payment_method=pm_fallback')
    await expect(res.json()).resolves.toEqual({
      payment_id: 'pi_charge_fallback',
      status: 'succeeded',
    })

    const updated = await db
      .selectFrom('account')
      .where('id', '=', account.id)
      .select('default_payment_method_id')
      .executeTakeFirstOrThrow()
    expect(updated.default_payment_method_id).toBe('pm_fallback')
  })

  test('returns requires_action with fallback URL when 3DS required', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: `cus_${Nanoid.generate()}` })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({
          data: [{ id: 'pm_3ds', card: { brand: 'visa', last4: '4242' } }],
          object: 'list',
        }),
      ),
      http.post('https://api.stripe.com/v1/payment_intents', () =>
        HttpResponse.json({
          id: 'pi_3ds_test',
          status: 'requires_action',
          client_secret: 'pi_3ds_secret',
          object: 'payment_intent',
        }),
      ),
      http.post('https://api.stripe.com/v1/customer_sessions', () =>
        HttpResponse.json({
          client_secret: 'cs_3ds_session',
          object: 'customer_session',
        }),
      ),
    )

    const res = await client.api.credits.charge.$post(
      { json: { amount: '1000' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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

  test('returns requires_action when off-session charge needs authentication', async () => {
    const account = await factory.account.insert({})
    await db
      .updateTable('account')
      .set({ stripe_customer_id: `cus_${Nanoid.generate()}` })
      .where('id', '=', account.id)
      .execute()
    const session = await factory.session.insert({ account_id: account.id })

    server.use(
      http.get('https://api.stripe.com/v1/payment_methods', () =>
        HttpResponse.json({
          data: [{ id: 'pm_3ds_error', card: { brand: 'visa', last4: '4242' } }],
          object: 'list',
        }),
      ),
      http.post('https://api.stripe.com/v1/payment_intents', () =>
        HttpResponse.json(
          {
            error: {
              code: 'authentication_required',
              message: 'This transaction requires authentication.',
              payment_intent: {
                client_secret: 'pi_3ds_error_secret',
                id: 'pi_3ds_error',
                object: 'payment_intent',
                status: 'requires_payment_method',
              },
              type: 'card_error',
            },
          },
          { status: 402 },
        ),
      ),
      http.post('https://api.stripe.com/v1/customer_sessions', () =>
        HttpResponse.json({
          client_secret: 'cs_test_dummy_secret',
          object: 'customer_session',
        }),
      ),
    )

    const res = await client.api.credits.charge.$post(
      { json: { amount: '1000' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
    expect(kvData).toMatchObject({
      amount: 1000,
      cs_secret: 'cs_test_dummy_secret',
      locked: true,
      pi_secret: 'pi_3ds_error_secret',
    })
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    assert('api_key' in json, 'expected api_key')
    expect(json.api_key.name).toBe('test token')
    expect(json.api_key.token.startsWith('curlmd_')).toBe(true)
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
    const token = ApiKey.generate()
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
          'x-organization-id': org.id,
        },
      },
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    assert('api_key' in json, 'expected api_key')
    expect(json.api_key.organization_id).toBe(org.id)
  })

  test('allows same name across different organizations', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })

    // Create token "foo" under org
    const res1 = await client.api.tokens.$post(
      { json: { name: 'foo' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
          'x-organization-id': org.id,
        },
      },
    )
    expect(res1.status).toBe(201)

    // Create token "foo" under personal account (no org)
    const res2 = await client.api.tokens.$post(
      { json: { name: 'foo' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res2.status).toBe(201)
  })

  test('rejects duplicate name', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    await client.api.tokens.$post(
      { json: { name: 'dupe' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    const res = await client.api.tokens.$post(
      { json: { name: 'dupe' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json).toEqual({ code: 'name_taken', message: expect.any(String) })
  })
})

describe('GET /api/tokens', () => {
  test('lists tokens', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const token1 = ApiKey.generate()
    await factory.api_key.insert({
      account_id: account.id,
      key_hash: await ApiKey.hash(token1),
      key_prefix: token1.slice(0, 14),
      name: 'key 1',
    })
    const token2 = ApiKey.generate()
    await factory.api_key.insert({
      account_id: account.id,
      key_hash: await ApiKey.hash(token2),
      key_prefix: token2.slice(0, 14),
      name: 'key 2',
    })

    const res = await client.api.tokens.$get(
      {},
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as Extract<
      Awaited<ReturnType<typeof res.json>>,
      { api_keys: unknown }
    >
    expect(json.api_keys).toHaveLength(2)
  })

  test('scopes to organization when header present', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })
    const orgToken = ApiKey.generate()
    await factory.api_key.insert({
      account_id: account.id,
      organization_id: org.id,
      key_hash: await ApiKey.hash(orgToken),
      key_prefix: orgToken.slice(0, 14),
      name: 'org key',
    })
    const acctToken = ApiKey.generate()
    await factory.api_key.insert({
      account_id: account.id,
      key_hash: await ApiKey.hash(acctToken),
      key_prefix: acctToken.slice(0, 14),
      name: 'account key',
    })

    const res = await client.api.tokens.$get(
      {},
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
          'x-organization-id': org.id,
        },
      },
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as Extract<
      Awaited<ReturnType<typeof res.json>>,
      { api_keys: unknown[] }
    >
    expect(json.api_keys).toHaveLength(1)
    expect(json.api_keys[0]!.name).toBe('org key')
  })

  test('shows only account tokens when no org header', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })
    const orgToken = ApiKey.generate()
    await factory.api_key.insert({
      account_id: account.id,
      organization_id: org.id,
      key_hash: await ApiKey.hash(orgToken),
      key_prefix: orgToken.slice(0, 14),
      name: 'org key',
    })
    const acctToken = ApiKey.generate()
    await factory.api_key.insert({
      account_id: account.id,
      key_hash: await ApiKey.hash(acctToken),
      key_prefix: acctToken.slice(0, 14),
      name: 'account key',
    })

    const res = await client.api.tokens.$get(
      {},
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as Extract<
      Awaited<ReturnType<typeof res.json>>,
      { api_keys: unknown[] }
    >
    expect(json.api_keys).toHaveLength(1)
    expect(json.api_keys[0]!.name).toBe('account key')
  })

  test('excludes deleted tokens', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const activeToken = ApiKey.generate()
    await factory.api_key.insert({
      account_id: account.id,
      key_hash: await ApiKey.hash(activeToken),
      key_prefix: activeToken.slice(0, 14),
      name: 'active key',
    })
    const deletedToken = ApiKey.generate()
    await factory.api_key.insert({
      account_id: account.id,
      key_hash: await ApiKey.hash(deletedToken),
      key_prefix: deletedToken.slice(0, 14),
      name: 'deleted key',
      deleted_at: new Date().toISOString(),
    })

    const res = await client.api.tokens.$get(
      {},
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
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
    const softDelToken = ApiKey.generate()
    const apiKey = await factory.api_key.insert({
      account_id: account.id,
      key_hash: await ApiKey.hash(softDelToken),
      key_prefix: softDelToken.slice(0, 14),
      name: 'to delete',
    })

    const res = await client.api.tokens[':id'].$delete(
      { param: { id: apiKey.id } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
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
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(404)
  })

  test('cannot delete another account token', async () => {
    const account1 = await factory.account.insert({})
    const account2 = await factory.account.insert({})
    const session2 = await factory.session.insert({ account_id: account2.id })
    const otherToken = ApiKey.generate()
    const apiKey = await factory.api_key.insert({
      account_id: account1.id,
      key_hash: await ApiKey.hash(otherToken),
      key_prefix: otherToken.slice(0, 14),
      name: 'account1 key',
    })

    const res = await client.api.tokens[':id'].$delete(
      { param: { id: apiKey.id } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session2.id, env.COOKIE_SECRET),
        },
      },
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    assert(!('code' in json), 'expected organizations')
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    assert(!('code' in json), 'expected organization')
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
      code: 'validation_error',
      message: expect.any(String),
      issues: expect.arrayContaining([{ path: 'login', message: expect.any(String) }]),
    })
  })

  test('rejects missing login with validation_error', async () => {
    const res = await client.api.orgs.$post({
      // @ts-expect-error -- testing missing required field
      json: {},
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      code: 'validation_error',
      message: expect.any(String),
      issues: expect.arrayContaining([{ path: 'login', message: expect.any(String) }]),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      code: 'login_reserved',
      message: expect.any(String),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ code: 'login_taken', message: expect.any(String) })
  })

  test('rejects duplicate login', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const existing = await factory.organization.insert({})

    const res = await client.api.orgs.$post(
      { json: { login: existing.login } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      code: 'login_taken',
      message: expect.any(String),
    })
  })
})

describe('GET /api/cli/latest', () => {
  afterEach(async () => {
    await env.KV.delete('cli:latest')
  })

  test('returns latest version from npm registry', async () => {
    server.use(
      http.get('https://registry.npmjs.org/curl.md', () =>
        HttpResponse.json({
          'dist-tags': { latest: '0.0.4' },
          time: { '0.0.4': '2025-03-04T00:00:00.000Z' },
        }),
      ),
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
    server.use(
      http.get(
        'https://registry.npmjs.org/curl.md',
        () => new HttpResponse('Service Unavailable', { status: 503 }),
      ),
    )

    const res = await client.api.cli.latest.$get({ query: {} })
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toEqual({
      code: 'upstream_error',
      message: expect.any(String),
    })
  })

  test('returns 502 when no latest version in registry', async () => {
    server.use(
      http.get('https://registry.npmjs.org/curl.md', () => HttpResponse.json({ 'dist-tags': {} })),
    )

    const res = await client.api.cli.latest.$get({ query: {} })
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toEqual({
      code: 'version_not_found',
      message: expect.any(String),
    })
  })

  test('accepts analytics query params', async () => {
    server.use(
      http.get('https://registry.npmjs.org/curl.md', () =>
        HttpResponse.json({
          'dist-tags': { latest: '0.0.4' },
          time: { '0.0.4': '2025-03-04T00:00:00.000Z' },
        }),
      ),
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
    code: 'validation_error',
    message: expect.any(String),
    issues: expect.arrayContaining([{ path: expect.any(String), message: expect.any(String) }]),
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
        Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        'x-organization-id': org.id,
      },
    },
  )
  expect(res.status).toBe(403)
  await expect(res.json()).resolves.toEqual({
    code: 'organization_access_denied',
    message: expect.any(String),
  })
})

test('GET /api/:url fetches URL and returns markdown', async () => {
  server.use(
    http.get(
      'https://api-test.example.com/',
      () =>
        new HttpResponse('<html><body><h1>Hello</h1><p>World</p></body></html>', {
          headers: { 'content-type': 'text/html' },
        }),
    ),
  )

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

test('GET /api/:url supports query param aliases', async () => {
  server.use(
    http.get(
      'https://alias-test.example.com/',
      () =>
        new HttpResponse(
          '<html><body><h2>Introduction</h2><p>Hello</p><h2>Details</h2><p>World</p></body></html>',
          { headers: { 'content-type': 'text/html' } },
        ),
    ),
  )

  // `k` alias for `keywords`
  const kRes = await api.request(
    '/api/alias-test.example.com?k=Introduction',
    { headers: { 'cf-connecting-ip': '10.0.0.50' } },
    env,
    executionCtx,
  )
  expect(kRes.status).toBe(200)
  const kText = await kRes.text()
  expect(kText).toContain('Hello')
  expect(kText).not.toContain('World')
})

test('GET /api/:url returns fetch rate limit headers', async () => {
  server.use(
    http.get(
      'https://rl-fetch.example.com/',
      () =>
        new HttpResponse('<html><body><p>ok</p></body></html>', {
          headers: { 'content-type': 'text/html' },
        }),
    ),
  )

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
  server.use(
    http.get(
      'https://rl-authed-fetch.example.com/',
      () =>
        new HttpResponse('<html><body><p>ok</p></body></html>', {
          headers: { 'content-type': 'text/html' },
        }),
    ),
  )

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-authed-fetch.example.com' }, query: {} },
    {
      headers: {
        Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
      extras: {},
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

test('GET /api/:url returns a readable ai_failed message for numeric AI errors', async () => {
  server.use(
    http.get(
      'https://ai-failed.example.com/',
      () =>
        new HttpResponse('<html><body><p>ok</p></body></html>', {
          headers: { 'content-type': 'text/html' },
        }),
    ),
  )

  const localClient = testClient(
    api,
    {
      ...env,
      AI: {
        run: vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('error code: 1031'), { name: 'InferenceUpstreamError' }),
          ),
      } as unknown as typeof env.AI,
    } as unknown as typeof env,
    executionCtx,
  )

  const res = await localClient.api[':url{.+}'].$get({
    param: { url: 'ai-failed.example.com' },
    query: { objective: 'find the important part' },
  })

  expect(res.status).toBe(502)
  await expect(res.json()).resolves.toEqual({
    code: 'ai_failed',
    message: 'Inference upstream error (1031)',
  })
})

test('GET /api/:url reports upstream 5xx fetch failures to sentry', async () => {
  const captureException = vi.spyOn(Sentry, 'captureException').mockImplementation(() => '')
  server.use(
    http.get('https://fetch-failed.example.com/', () => new HttpResponse(null, { status: 500 })),
  )

  const res = await client.api[':url{.+}'].$get({
    param: { url: 'fetch-failed.example.com' },
    query: {},
  })

  expect(res.status).toBe(502)
  await expect(res.json()).resolves.toEqual({
    code: 'fetch_failed',
    message: 'Upstream returned 500',
  })
  expect(captureException).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'Upstream returned 500 for https://fetch-failed.example.com/',
    }),
  )
  captureException.mockRestore()
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
  await expect(res.json()).resolves.toEqual({
    code: 'rate_limit_exceeded',
    message: expect.any(String),
  })
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
  await expect(res.json()).resolves.toEqual({
    code: 'rate_limit_exceeded',
    message: expect.any(String),
  })
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
        Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
      },
    },
  )
  expect(res.status).toBe(429)
  const json = await res.json()
  expect(json).toEqual({
    code: 'rate_limit_exceeded',
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

  server.use(
    http.get(
      'https://rl-paid.example.com/',
      () =>
        new HttpResponse('<html><body><p>ok</p></body></html>', {
          headers: { 'content-type': 'text/html' },
        }),
    ),
  )

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-paid.example.com' }, query: {} },
    {
      headers: {
        Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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

  server.use(
    http.get(
      'https://rl-zero-bal.example.com/',
      () =>
        new HttpResponse('<html><body><p>ok</p></body></html>', {
          headers: { 'content-type': 'text/html' },
        }),
    ),
  )

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-zero-bal.example.com' }, query: {} },
    {
      headers: {
        Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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

  server.use(
    http.get(
      'https://rl-credits.example.com/',
      () =>
        new HttpResponse('<html><body><p>ok</p></body></html>', {
          headers: { 'content-type': 'text/html' },
        }),
    ),
  )

  const res = await client.api[':url{.+}'].$get(
    { param: { url: 'rl-credits.example.com' }, query: {} },
    {
      headers: {
        Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
      extras: {},
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
        Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(404)
  })

  test('does not exceed max_uses under concurrent accepts', async () => {
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
      max_uses: 2,
    })

    const joiners = await factory.account.insert({}, {}, {}, {})
    const sessions = await factory.session.insert(...joiners.map((j) => ({ account_id: j.id })))

    const results = await Promise.all(
      sessions.map(async (session) => {
        const res = await client.api.invites[':token'].accept.$post(
          { param: { token: invite.token } },
          {
            headers: {
              Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
            },
          },
        )
        return res.status
      }),
    )

    const successes = results.filter((s) => s === 200)
    expect(successes.length).toBeLessThanOrEqual(2)

    const updated = await db
      .selectFrom('organization_invite')
      .where('id', '=', invite.id)
      .select('use_count')
      .executeTakeFirstOrThrow()
    expect(updated.use_count).toBeLessThanOrEqual(2)
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      code: 'already_member',
      message: expect.any(String),
    })

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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(403)
  })

  test('returns 403 when admin creates admin invite', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'admin',
    })

    const res = await client.api.orgs[':id'].invites.$post(
      { param: { id: org.id }, json: { role: 'admin' } },
      {
        headers: {
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      code: 'cannot_change_owner',
      message: expect.any(String),
    })
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      code: 'cannot_remove_self',
      message: expect.any(String),
    })
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
        },
      },
    )
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      code: 'cannot_remove_owner',
      message: expect.any(String),
    })
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
          Cookie: await Cookie.generateSigned('curl.session', session.id, env.COOKIE_SECRET),
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
    await expect(res.json()).resolves.toEqual({
      code: 'missing_signature',
      message: expect.any(String),
    })
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
    await expect(res.json()).resolves.toEqual({
      code: 'invalid_signature',
      message: expect.any(String),
    })
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
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
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

describe('POST /api/sentry/tunnel', () => {
  test('returns 400 for invalid envelope', async () => {
    const res = await api.request('/api/sentry/tunnel', { method: 'POST', body: 'no-newline' }, env)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      code: 'invalid_envelope',
      message: expect.any(String),
    })
  })

  test('forwards envelope to sentry', async () => {
    server.use(
      http.post('https://o123.ingest.us.sentry.io/api/456/envelope/', () =>
        HttpResponse.json({ id: 'ok' }),
      ),
    )

    const res = await api.request(
      '/api/sentry/tunnel',
      { method: 'POST', body: 'header\npayload' },
      env,
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
  })

  test('returns 502 on upstream error', async () => {
    server.use(
      http.post('https://o123.ingest.us.sentry.io/api/456/envelope/', () =>
        HttpResponse.json({ error: 'rate_limited' }, { status: 429 }),
      ),
    )

    const res = await api.request(
      '/api/sentry/tunnel',
      { method: 'POST', body: 'header\npayload' },
      env,
    )
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toEqual({
      code: 'sentry_upstream_error',
      message: expect.any(String),
    })
  })
})

function toSearchParams(formData: FormData) {
  return new URLSearchParams(
    Array.from(formData.entries()).map(([key, value]) => [key, String(value)]),
  )
}
