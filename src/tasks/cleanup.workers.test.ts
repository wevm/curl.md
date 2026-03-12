import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { afterAll, expect, test } from 'vitest'
import { getDb } from '#lib/db.ts'
import { cleanupExpired } from '#tasks/cleanup.ts'
import { createFactory } from '../../test/factory.ts'

const db = getDb(env.DB.connectionString, { max: 1 })
const factory = createFactory(db)

afterAll(() => db.destroy())

async function runCleanup() {
  const ctx = createExecutionContext()
  await cleanupExpired(env as unknown as Env, ctx)
  await waitOnExecutionContext(ctx)
}

test('deletes expired device codes', async () => {
  const account = await factory.account.insert({})
  await db
    .insertInto('device_code')
    .values({
      account_id: account.id,
      code: 'expired-code',
      expires_at: new Date(Date.now() - 1000).toISOString(),
      status: 'pending',
      user_code: 'ABCD1234',
    })
    .execute()

  await runCleanup()

  const rows = await db
    .selectFrom('device_code')
    .where('code', '=', 'expired-code')
    .selectAll()
    .execute()
  expect(rows).toHaveLength(0)
})

test('preserves non-expired device codes', async () => {
  const account = await factory.account.insert({})
  await db
    .insertInto('device_code')
    .values({
      account_id: account.id,
      code: 'valid-code',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      status: 'pending',
      user_code: 'EFGH5678',
    })
    .execute()

  await runCleanup()

  const rows = await db
    .selectFrom('device_code')
    .where('code', '=', 'valid-code')
    .selectAll()
    .execute()
  expect(rows).toHaveLength(1)
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
