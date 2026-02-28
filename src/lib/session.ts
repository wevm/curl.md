import { parseSigned } from 'hono/utils/cookie'
import type { Kysely } from 'kysely'
import type { DB } from '#lib/db.gen.ts'

export async function getAccountId(
  request: Request,
  db: Kysely<DB>,
  secret: string,
) {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const parsed = await parseSigned(cookieHeader, secret, 'curl.session')
  const sessionId = parsed['curl.session']
  if (!sessionId) return null
  const session = await db
    .selectFrom('session')
    .where('id', '=', sessionId)
    .where('expires_at', '>', new Date())
    .select('account_id')
    .executeTakeFirst()
  return session?.account_id ?? null
}
