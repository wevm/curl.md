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

export function requestFinalTokensSql(table = 'request') {
  return sql<number | null>`coalesce(
    ${sql.ref(`${table}.extracted_tokens`)},
    ${sql.ref(`${table}.filtered_tokens`)},
    ${sql.ref(`${table}.markdown_tokens`)}
  )`
}

export function requestTokensSavedSql(table = 'request') {
  return sql<number>`coalesce(
    case
      when ${sql.ref(`${table}.source_tokens`)} is not null
        and ${requestFinalTokensSql(table)} is not null
      then ${sql.ref(`${table}.source_tokens`)} - ${requestFinalTokensSql(table)}
      else 0
    end,
    0
  )`
}

export function requestTokensSavedSumSql(table = 'request') {
  return sql<number>`coalesce(sum(${requestTokensSavedSql(table)}), 0)`
}
