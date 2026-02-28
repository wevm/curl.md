import { Kysely } from 'kysely'
import type { DB } from '#lib/db.gen.ts'
import { dialect } from '#lib/pg.ts'

export function getDb(connectionString: string) {
  return new Kysely<DB>({
    dialect: dialect(connectionString),
  })
}
