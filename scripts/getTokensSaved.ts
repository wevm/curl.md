import { Kysely } from 'kysely'
import { z } from 'zod'
import { dialect } from '../db/client.ts'

const env = z.parse(z.object({ DB_URL: z.string() }), process.env)
const dbUrl = new URL(env.DB_URL)
dbUrl.searchParams.delete('sslrootcert')

const db = new Kysely<{
  request: { tokens_saved: number | null }
}>({ dialect: dialect(dbUrl.toString()) })

const result = await db
  .selectFrom('request')
  .select((eb) => eb.fn.sum<number>('tokens_saved').as('total'))
  .executeTakeFirst()

process.stdout.write(String(result?.total ?? 0))
process.exit()
