import { env } from 'cloudflare:workers'
import { afterAll, expect, test } from 'vitest'
import { createClient } from '#db/client.ts'
import * as ApiKey from '#lib/apiKey.ts'
import * as SessionToken from '#lib/sessionToken.ts'
import { createFactory } from '#test/factory.ts'

const db = createClient(env.DB.connectionString, { max: 1 })
const factory = createFactory(db)

afterAll(() => db.destroy())

test('createCliSession stores cli session and access token', async () => {
  const account = await factory.account.insert({})

  const cliSession = await SessionToken.createCliSession(db, account.id)
  const accessToken = cliSession.authorization.slice('Bearer '.length)

  expect(cliSession.authorization).toMatch(/^Bearer curlmd_at_[0-9a-z]{40}$/)
  expect(cliSession.refresh_token).toMatch(/^curlmd_rt_[0-9a-z]{40}$/)
  expect(new Date(cliSession.expires_at).getTime()).toBeGreaterThan(Date.now())
  expect(new Date(cliSession.refresh_token_expires_at).getTime()).toBeGreaterThan(Date.now())

  const session = await db
    .selectFrom('session')
    .where('account_id', '=', account.id)
    .where('session_type', '=', 'cli')
    .select(['id', 'refresh_token_hash'])
    .executeTakeFirstOrThrow()

  expect(session.refresh_token_hash).toBe(await ApiKey.hash(cliSession.refresh_token))

  const accessTokenRow = await db
    .selectFrom('session_access_token')
    .where('session_id', '=', session.id)
    .where('token_hash', '=', await ApiKey.hash(accessToken))
    .select('session_id')
    .executeTakeFirst()

  expect(accessTokenRow).toEqual({ session_id: session.id })
})

test('mintAuthHeaders returns a persisted access token for a valid refresh token', async () => {
  const account = await factory.account.insert({})

  const cliSession = await SessionToken.createCliSession(db, account.id)
  const headers = await SessionToken.mintAuthHeaders(db, cliSession.refresh_token)

  expect(headers).not.toBeNull()
  expect(headers?.authorization).toMatch(/^Bearer curlmd_at_[0-9a-z]{40}$/)
  expect(headers?.authorization).not.toBe(cliSession.authorization)
  expect(headers ? new Date(headers.expires_at).getTime() : 0).toBeGreaterThan(Date.now())

  if (!headers) throw new Error('Expected auth headers')
  const accessToken = headers.authorization.slice('Bearer '.length)

  const session = await db
    .selectFrom('session')
    .where('account_id', '=', account.id)
    .where('session_type', '=', 'cli')
    .select('id')
    .executeTakeFirstOrThrow()

  const accessTokenRow = await db
    .selectFrom('session_access_token')
    .where('session_id', '=', session.id)
    .where('token_hash', '=', await ApiKey.hash(accessToken))
    .select('session_id')
    .executeTakeFirst()

  expect(accessTokenRow).toEqual({ session_id: session.id })
})

test('mintAuthHeaders returns null for an expired refresh token', async () => {
  const account = await factory.account.insert({})

  const cliSession = await SessionToken.createCliSession(db, account.id)

  await db
    .updateTable('session')
    .set({ expires_at: new Date(Date.now() - 1000) })
    .where('refresh_token_hash', '=', await ApiKey.hash(cliSession.refresh_token))
    .execute()

  expect(await SessionToken.mintAuthHeaders(db, cliSession.refresh_token)).toBeNull()
})

test('deleteCliSessionByToken deletes cli session by active access token', async () => {
  const account = await factory.account.insert({})

  const cliSession = await SessionToken.createCliSession(db, account.id)
  const accessToken = cliSession.authorization.slice('Bearer '.length)
  const refreshTokenHash = await ApiKey.hash(cliSession.refresh_token)

  await SessionToken.deleteCliSessionByToken(db, accessToken)

  const session = await db
    .selectFrom('session')
    .where('refresh_token_hash', '=', refreshTokenHash)
    .select('id')
    .executeTakeFirst()

  expect(session).toBeUndefined()
})

test('deleteCliSessionByToken deletes cli session by refresh token when access token is expired', async () => {
  const account = await factory.account.insert({})

  const cliSession = await SessionToken.createCliSession(db, account.id)
  const accessToken = cliSession.authorization.slice('Bearer '.length)
  const refreshTokenHash = await ApiKey.hash(cliSession.refresh_token)

  await db
    .updateTable('session_access_token')
    .set({ expires_at: new Date(Date.now() - 1000) })
    .where('token_hash', '=', await ApiKey.hash(accessToken))
    .execute()

  await SessionToken.deleteCliSessionByToken(db, cliSession.refresh_token)

  const session = await db
    .selectFrom('session')
    .where('refresh_token_hash', '=', refreshTokenHash)
    .select('id')
    .executeTakeFirst()

  expect(session).toBeUndefined()
})
