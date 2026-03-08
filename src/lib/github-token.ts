import type { Kysely } from 'kysely'
import * as Crypto from '#lib/crypto.ts'
import type { DB } from '#lib/db.gen.ts'

export async function getGithubToken(
  accountId: string,
  db: Kysely<DB>,
  encryptionKey: string,
): Promise<string | null> {
  const provider = await db
    .selectFrom('account_provider')
    .where('account_id', '=', accountId)
    .where('provider', '=', 'github')
    .select(['access_token', 'access_token_expires_at'])
    .executeTakeFirst()
  if (!provider?.access_token) return null
  if (
    provider.access_token_expires_at &&
    provider.access_token_expires_at < new Date()
  )
    return null
  return Crypto.decrypt(provider.access_token, encryptionKey)
}
