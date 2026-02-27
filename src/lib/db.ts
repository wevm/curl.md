import { env } from 'cloudflare:workers'
import type {
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  Driver,
  QueryCompiler,
  QueryResult,
} from 'kysely'
import {
  type CompiledQuery,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely'
import type { DB } from '#lib/db.gen.ts'

export function getDb() {
  return new Kysely<DB>({
    dialect: new D1Dialect({ database: env.DB }),
  })
}

// Vendored from https://github.com/aidenwallis/kysely-d1 (v0.4.0)
interface D1DialectConfig {
  database: D1Database | D1DatabaseSession
}

export class D1Dialect implements Dialect {
  #config: D1DialectConfig

  constructor(config: D1DialectConfig) {
    this.#config = config
  }

  createAdapter() {
    return new SqliteAdapter()
  }

  createDriver(): Driver {
    return new D1Driver(this.#config)
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler()
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db)
  }
}

class D1Driver implements Driver {
  #config: D1DialectConfig

  constructor(config: D1DialectConfig) {
    this.#config = config
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return new D1Connection(this.#config)
  }

  async beginTransaction(conn: D1Connection): Promise<void> {
    return await conn.beginTransaction()
  }

  async commitTransaction(conn: D1Connection): Promise<void> {
    return await conn.commitTransaction()
  }

  async rollbackTransaction(conn: D1Connection): Promise<void> {
    return await conn.rollbackTransaction()
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {}
}

class D1Connection implements DatabaseConnection {
  #config: D1DialectConfig

  constructor(config: D1DialectConfig) {
    this.#config = config
  }

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const results = await this.#config.database
      .prepare(compiledQuery.sql)
      .bind(...compiledQuery.parameters)
      .all()

    if (results.error) throw new Error(results.error)

    const numAffectedRows =
      results.meta.changes > 0 ? BigInt(results.meta.changes) : undefined

    return {
      insertId:
        results.meta.last_row_id === undefined ||
        results.meta.last_row_id === null
          ? undefined
          : BigInt(results.meta.last_row_id),
      rows: (results?.results as O[]) || [],
      numAffectedRows,
    }
  }

  async beginTransaction(): Promise<void> {
    throw new Error('Transactions are not supported yet.')
  }

  async commitTransaction(): Promise<void> {
    throw new Error('Transactions are not supported yet.')
  }

  async rollbackTransaction(): Promise<void> {
    throw new Error('Transactions are not supported yet.')
  }

  // biome-ignore lint/correctness/useYield: required by interface
  async *streamQuery<O>(): AsyncIterableIterator<QueryResult<O>> {
    throw new Error('D1 Driver does not support streaming')
  }
}
