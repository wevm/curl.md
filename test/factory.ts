import type { Insertable, Kysely, Selectable } from 'kysely'
import type { DB } from '#lib/db.gen.ts'
import * as Nanoid from '#lib/nanoid.ts'

export function createFactory(db: Kysely<DB>) {
  function factory(table: keyof DB) {
    return {
      attrs(...args: Record<string, unknown>[]) {
        const attrs = args.map((overrides) => ({
          ...defaultConfig[table]?.(),
          ...overrides,
        }))
        return attrs.length === 1 ? attrs[0] : attrs
      },
      async insert(...args: Record<string, unknown>[]) {
        const values = this.attrs(...args)
        const rows = Array.isArray(values) ? values : [values]

        // biome-ignore lint/suspicious/noExplicitAny: dynamic table name
        const result = await (db.insertInto(table) as any)
          .values(rows)
          .returningAll()
          .execute()

        return rows.length === 1 ? result[0] : result
      },
    }
  }
  return new Proxy({} as Factory, {
    get(_target, table) {
      return factory(table as keyof DB)
    },
  })
}

const defaultConfig: Partial<{
  [K in keyof DB]: () => Partial<Insertable<DB[K]>>
}> = {
  account() {
    const id = Nanoid.generate()
    return {
      email: `${id}@example.com`,
      login: id,
      name: `User ${id}`,
    }
  },
  account_provider() {
    return {
      provider: 'github',
      provider_account_id: String(Math.floor(Math.random() * 1_000_000)),
    }
  },
  organization() {
    const login = Nanoid.generate()
    return {
      login,
      name: login,
    }
  },
  organization_member() {
    return {
      role: 'member',
    }
  },
  api_key() {
    return {
      key_hash: Nanoid.generate(),
      key_prefix: 'curl_',
      name: `Key ${Nanoid.generate()}`,
    }
  },
  session() {
    return {
      expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(), // 30 days
    }
  },
}

type Factory = {
  [K in keyof DB]: {
    attrs: <const V extends readonly Record<string, unknown>[]>(
      ...args: V & AttrsValidation<K, V>
    ) => V['length'] extends 1 ? Selectable<DB[K]> : Selectable<DB[K]>[]
    insert: <const V extends readonly Record<string, unknown>[]>(
      ...args: V & AttrsValidation<K, V>
    ) => Promise<
      V['length'] extends 1 ? Selectable<DB[K]> : Selectable<DB[K]>[]
    >
  }
}

type AttrsValidation<
  K extends keyof DB,
  V extends readonly Record<string, unknown>[],
> = {
  [I in keyof V]: Partial<Insertable<DB[K]>> & RequiredForeignKeys<DB[K]>
}

type RequiredForeignKeys<T> = {
  [K in keyof T as K extends `${string}_id`
    ? null extends T[K]
      ? never
      : K extends 'id'
        ? never
        : K
    : never]-?: T[K]
}
