import type { Kysely } from 'kysely'
import { z } from 'zod'
import type { DB } from '#db/types.gen.ts'
import * as Crypto from '#lib/crypto.ts'

export async function resolveToken(
  db: Kysely<DB>,
  accountId: string,
  env: Pick<Cloudflare.Env, 'GH_CLIENT_ID' | 'GH_CLIENT_SECRET' | 'TOKEN_ENCRYPTION_KEY'>,
): Promise<string | undefined> {
  const provider = await db
    .selectFrom('account_provider')
    .where('account_id', '=', accountId)
    .where('provider', '=', 'github')
    .select([
      'access_token',
      'access_token_expires_at',
      'refresh_token',
      'refresh_token_expires_at',
    ])
    .executeTakeFirst()
  if (!provider?.access_token) return undefined

  const now = Date.now()

  // Access token is still valid
  if (
    !provider.access_token_expires_at ||
    provider.access_token_expires_at.getTime() > now + 5 * 60 * 1000 // 5m buffer
  )
    return Crypto.decrypt(provider.access_token, env.TOKEN_ENCRYPTION_KEY)

  // Access token expired — try refresh
  if (!provider.refresh_token) return undefined
  if (provider.refresh_token_expires_at && provider.refresh_token_expires_at.getTime() <= now)
    return undefined

  const decryptedRefreshToken = await Crypto.decrypt(
    provider.refresh_token,
    env.TOKEN_ENCRYPTION_KEY,
  )

  const tokenUrl = new URL('https://github.com/login/oauth/access_token')
  tokenUrl.searchParams.set('client_id', env.GH_CLIENT_ID)
  tokenUrl.searchParams.set('client_secret', env.GH_CLIENT_SECRET)
  tokenUrl.searchParams.set('grant_type', 'refresh_token')
  tokenUrl.searchParams.set('refresh_token', decryptedRefreshToken)

  const tokenSchema = z.object({
    access_token: z.string(),
    expires_in: z.number(),
    refresh_token: z.string(),
    refresh_token_expires_in: z.number(),
    token_type: z.literal('bearer'),
  })
  let tokenData: z.infer<typeof tokenSchema>
  try {
    const res = await fetch(tokenUrl.toString(), {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })
    const parsed = z.safeParse(tokenSchema, await res.json())
    if (!parsed.success) return undefined
    tokenData = parsed.data
  } catch {
    return undefined
  }

  const encryptedAccessToken = await Crypto.encrypt(
    tokenData.access_token,
    env.TOKEN_ENCRYPTION_KEY,
  )
  const encryptedRefreshToken = await Crypto.encrypt(
    tokenData.refresh_token,
    env.TOKEN_ENCRYPTION_KEY,
  )
  const access_token_expires_at = new Date(now + tokenData.expires_in * 1000)
  const refresh_token_expires_at = new Date(now + tokenData.refresh_token_expires_in * 1000)

  await db
    .updateTable('account_provider')
    .set({
      access_token: encryptedAccessToken,
      access_token_expires_at,
      refresh_token: encryptedRefreshToken,
      refresh_token_expires_at,
    })
    .where('account_id', '=', accountId)
    .where('provider', '=', 'github')
    .execute()

  return tokenData.access_token
}
