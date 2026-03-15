import { type Expression, sql } from 'kysely'

export function lower(expr: Expression<string | null>) {
  return sql<string>`lower(${expr})`
}

export function nanoid() {
  return sql<string>`nanoid()`
}

export function now() {
  return sql<Date>`now()`
}
