import { customAlphabet } from 'nanoid'
import type { Database } from '#db/client.ts'
import * as ApiKey from '#lib/apiKey.ts'
import * as Nanoid from '#lib/nanoid.ts'

export const accessTokenPrefix = 'curlmd_at_'
const refreshTokenPrefix = 'curlmd_rt_'
const tokenBody = customAlphabet(Nanoid.alphabet, 40)

const accessTokenTtlMs = 15 * 60 * 1000 // 15 minutes
const refreshTokenTtlMs = 30 * 24 * 60 * 60 * 1000 // 30 days

export async function createCliSession(db: Database, accountId: string) {
  const accessToken = `${accessTokenPrefix}${tokenBody()}`
  const refreshToken = `${refreshTokenPrefix}${tokenBody()}`
  const accessTokenExpiresAt = new Date(Date.now() + accessTokenTtlMs)
  const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenTtlMs)
  const session = await db
    .insertInto('session')
    .values({
      account_id: accountId,
      expires_at: refreshTokenExpiresAt,
      refresh_token_hash: await ApiKey.hash(refreshToken),
      session_type: 'cli',
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  await db
    .insertInto('session_access_token')
    .values({
      expires_at: accessTokenExpiresAt,
      session_id: session.id,
      token_hash: await ApiKey.hash(accessToken),
    })
    .execute()

  return {
    authorization: `Bearer ${accessToken}`,
    expires_at: accessTokenExpiresAt.toISOString(),
    refresh_token: refreshToken,
    refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
  }
}

export async function deleteCliSessionByToken(db: Database, token: string) {
  const tokenHash = await ApiKey.hash(token)
  const accessToken = await db
    .selectFrom('session_access_token')
    .select('session_id')
    .where('token_hash', '=', tokenHash)
    .where('expires_at', '>', new Date())
    .executeTakeFirst()
  if (accessToken) {
    await db.deleteFrom('session').where('id', '=', accessToken.session_id).execute()
    return
  }

  await db
    .deleteFrom('session')
    .where('session_type', '=', 'cli')
    .where('refresh_token_hash', '=', tokenHash)
    .execute()
}

export async function mintAuthHeaders(db: Database, token: string) {
  const tokenHash = await ApiKey.hash(token)
  const session = await db
    .selectFrom('session')
    .where('session_type', '=', 'cli')
    .where('refresh_token_hash', '=', tokenHash)
    .where('expires_at', '>', new Date())
    .select('id')
    .executeTakeFirst()
  if (!session) return null

  const accessToken = `${accessTokenPrefix}${tokenBody()}`
  const accessTokenExpiresAt = new Date(Date.now() + accessTokenTtlMs)

  await db
    .insertInto('session_access_token')
    .values({
      expires_at: accessTokenExpiresAt,
      session_id: session.id,
      token_hash: await ApiKey.hash(accessToken),
    })
    .execute()

  return {
    authorization: `Bearer ${accessToken}`,
    expires_at: accessTokenExpiresAt.toISOString(),
  }
}
