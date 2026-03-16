import { env } from 'cloudflare:workers'
import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, describe, expect, test } from 'vitest'
import { createClient } from '#db/client.ts'
import * as Crypto from '#lib/crypto.ts'
import * as GitHub from '#lib/github.ts'
import { createFactory } from '#test/factory.ts'
import { server } from '#test/server.ts'

const db = createClient(env.DB.connectionString, { max: 1 })
const factory = createFactory(db)

afterAll(() => db.destroy())

server.listen({ onUnhandledRequest: 'error' })
afterEach(() => server.resetHandlers())

describe('GitHub.resolveToken', () => {
  test('returns decrypted token when not expired', async () => {
    const account = await factory.account.insert({})
    const encrypted = await Crypto.encrypt('ghu_valid', env.TOKEN_ENCRYPTION_KEY)
    await factory.account_provider.insert({
      account_id: account.id,
      access_token: encrypted,
      access_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    })

    const token = await GitHub.resolveToken(db, account.id, env)
    expect(token).toBe('ghu_valid')
  })

  test('returns decrypted token when no expiry is set', async () => {
    const account = await factory.account.insert({})
    const encrypted = await Crypto.encrypt('ghu_no_expiry', env.TOKEN_ENCRYPTION_KEY)
    await factory.account_provider.insert({
      account_id: account.id,
      access_token: encrypted,
    })

    const token = await GitHub.resolveToken(db, account.id, env)
    expect(token).toBe('ghu_no_expiry')
  })

  test('returns undefined when no provider exists', async () => {
    const account = await factory.account.insert({})
    const token = await GitHub.resolveToken(db, account.id, env)
    expect(token).toBeUndefined()
  })

  test('returns undefined when access token is null', async () => {
    const account = await factory.account.insert({})
    await factory.account_provider.insert({
      account_id: account.id,
      access_token: null,
    })

    const token = await GitHub.resolveToken(db, account.id, env)
    expect(token).toBeUndefined()
  })

  test('refreshes expired token using refresh token', async () => {
    const account = await factory.account.insert({})
    const encryptedAccess = await Crypto.encrypt('ghu_expired', env.TOKEN_ENCRYPTION_KEY)
    const encryptedRefresh = await Crypto.encrypt('ghr_valid', env.TOKEN_ENCRYPTION_KEY)
    await factory.account_provider.insert({
      account_id: account.id,
      access_token: encryptedAccess,
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      refresh_token: encryptedRefresh,
      refresh_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    })

    server.use(
      http.post('https://github.com/login/oauth/access_token', async ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('grant_type')).toBe('refresh_token')
        expect(url.searchParams.get('refresh_token')).toBe('ghr_valid')
        return HttpResponse.json({
          access_token: 'ghu_refreshed',
          expires_in: 28800,
          refresh_token: 'ghr_new',
          refresh_token_expires_in: 15_811_200,
          token_type: 'bearer',
        })
      }),
    )

    const token = await GitHub.resolveToken(db, account.id, env)
    expect(token).toBe('ghu_refreshed')

    // Verify new tokens were persisted
    const provider = await db
      .selectFrom('account_provider')
      .where('account_id', '=', account.id)
      .where('provider', '=', 'github')
      .select(['access_token', 'refresh_token'])
      .executeTakeFirstOrThrow()
    const decryptedAccess = await Crypto.decrypt(provider.access_token!, env.TOKEN_ENCRYPTION_KEY)
    const decryptedRefresh = await Crypto.decrypt(provider.refresh_token!, env.TOKEN_ENCRYPTION_KEY)
    expect(decryptedAccess).toBe('ghu_refreshed')
    expect(decryptedRefresh).toBe('ghr_new')
  })

  test('returns undefined when refresh token is also expired', async () => {
    const account = await factory.account.insert({})
    const encryptedAccess = await Crypto.encrypt('ghu_expired', env.TOKEN_ENCRYPTION_KEY)
    const encryptedRefresh = await Crypto.encrypt('ghr_expired', env.TOKEN_ENCRYPTION_KEY)
    await factory.account_provider.insert({
      account_id: account.id,
      access_token: encryptedAccess,
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      refresh_token: encryptedRefresh,
      refresh_token_expires_at: new Date(Date.now() - 1000).toISOString(),
    })

    const token = await GitHub.resolveToken(db, account.id, env)
    expect(token).toBeUndefined()
  })

  test('returns undefined when no refresh token exists and access token expired', async () => {
    const account = await factory.account.insert({})
    const encryptedAccess = await Crypto.encrypt('ghu_expired', env.TOKEN_ENCRYPTION_KEY)
    await factory.account_provider.insert({
      account_id: account.id,
      access_token: encryptedAccess,
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
    })

    const token = await GitHub.resolveToken(db, account.id, env)
    expect(token).toBeUndefined()
  })

  test('returns undefined when GitHub refresh request fails', async () => {
    const account = await factory.account.insert({})
    const encryptedAccess = await Crypto.encrypt('ghu_expired', env.TOKEN_ENCRYPTION_KEY)
    const encryptedRefresh = await Crypto.encrypt('ghr_valid', env.TOKEN_ENCRYPTION_KEY)
    await factory.account_provider.insert({
      account_id: account.id,
      access_token: encryptedAccess,
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      refresh_token: encryptedRefresh,
      refresh_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    })

    server.use(
      http.post('https://github.com/login/oauth/access_token', () =>
        HttpResponse.json({
          error: 'bad_refresh_token',
          error_description: 'Bad refresh token',
        }),
      ),
    )

    const token = await GitHub.resolveToken(db, account.id, env)
    expect(token).toBeUndefined()
  })

  test('returns undefined when GitHub refresh request throws', async () => {
    const account = await factory.account.insert({})
    const encryptedAccess = await Crypto.encrypt('ghu_expired', env.TOKEN_ENCRYPTION_KEY)
    const encryptedRefresh = await Crypto.encrypt('ghr_valid', env.TOKEN_ENCRYPTION_KEY)
    await factory.account_provider.insert({
      account_id: account.id,
      access_token: encryptedAccess,
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      refresh_token: encryptedRefresh,
      refresh_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    })

    server.use(http.post('https://github.com/login/oauth/access_token', () => HttpResponse.error()))

    const token = await GitHub.resolveToken(db, account.id, env)
    expect(token).toBeUndefined()
  })
})
