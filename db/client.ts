import { type Expression, Kysely, sql } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import type { DB } from '#db/types.gen.ts'

export function createClient(connectionString: string, options?: { max?: number }) {
  return new Kysely<DB>({
    dialect: dialect(connectionString, options),
  })
}

export function dialect(url: string, options?: { max?: number }) {
  return new PostgresJSDialect({
    postgres: postgres(url, {
      ...(options?.max !== undefined && { max: options.max }),
    }),
  })
}

export function lower(expr: Expression<string | null>) {
  return sql<string>`lower(${expr})`
}

export function nanoid() {
  return sql<string>`nanoid()`
}

export function now() {
  return sql<Date>`now()`
}
