import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterAll, expect, test } from 'vitest'
import { cleanupExpired } from '#crons/cleanup.ts'
import { createClient } from '#db/client.ts'
import * as Nanoid from '#lib/nanoid.ts'
import { createFactory } from '#test/factory.ts'

const db = createClient(env.DB.connectionString, { max: 1 })
const factory = createFactory(db)

afterAll(() => db.destroy())

async function runCleanup() {
  const ctx = createExecutionContext()
  await cleanupExpired(env as unknown as Env, ctx)
  await waitOnExecutionContext(ctx)
}

test('deletes expired device codes', async () => {
  const account = await factory.account.insert({})
  const code = Nanoid.generate()
  await db
    .insertInto('device_code')
    .values({
      account_id: account.id,
      code,
      expires_at: new Date(Date.now() - 1000).toISOString(),
      status: 'pending',
      user_code: Nanoid.generate(8),
    })
    .execute()

  await runCleanup()

  const rows = await db.selectFrom('device_code').where('code', '=', code).selectAll().execute()
  expect(rows).toHaveLength(0)
})

test('preserves non-expired device codes', async () => {
  const account = await factory.account.insert({})
  const code = Nanoid.generate()
  await db
    .insertInto('device_code')
    .values({
      account_id: account.id,
      code,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      status: 'pending',
      user_code: Nanoid.generate(8),
    })
    .execute()

  await runCleanup()

  const rows = await db.selectFrom('device_code').where('code', '=', code).selectAll().execute()
  expect(rows).toHaveLength(1)
})

test('deletes expired session access tokens', async () => {
  const account = await factory.account.insert({})
  const session = await factory.session.insert({
    account_id: account.id,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  })
  const tokenHash = Nanoid.generate()

  await db
    .insertInto('session_access_token')
    .values({
      expires_at: new Date(Date.now() - 1000).toISOString(),
      session_id: session.id,
      token_hash: tokenHash,
    })
    .execute()

  await runCleanup()

  const tokenRows = await db
    .selectFrom('session_access_token')
    .where('token_hash', '=', tokenHash)
    .selectAll()
    .execute()
  expect(tokenRows).toHaveLength(0)

  const sessionRows = await db
    .selectFrom('session')
    .where('id', '=', session.id)
    .selectAll()
    .execute()
  expect(sessionRows).toHaveLength(1)
})

test('deletes expired sessions', async () => {
  const account = await factory.account.insert({})
  await factory.session.insert({
    account_id: account.id,
    expires_at: new Date(Date.now() - 1000).toISOString(),
  })

  const before = await db
    .selectFrom('session')
    .where('account_id', '=', account.id)
    .selectAll()
    .execute()
  expect(before).toHaveLength(1)

  await runCleanup()

  const after = await db
    .selectFrom('session')
    .where('account_id', '=', account.id)
    .selectAll()
    .execute()
  expect(after).toHaveLength(0)
})

test('preserves non-expired sessions', async () => {
  const account = await factory.account.insert({})
  await factory.session.insert({
    account_id: account.id,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  })

  await runCleanup()

  const rows = await db
    .selectFrom('session')
    .where('account_id', '=', account.id)
    .selectAll()
    .execute()
  expect(rows).toHaveLength(1)
})
