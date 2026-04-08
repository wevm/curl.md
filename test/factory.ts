import type { Insertable, Selectable } from 'kysely'
import type { Database } from '#db/client.ts'
import type { DB } from '#db/types.gen.ts'
import * as Nanoid from '#lib/nanoid.ts'

export function createFactory(db: Database) {
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

        // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic table name
        const result = await (db.insertInto(table) as any).values(rows).returningAll().execute()

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
  [table in keyof DB]: () => Partial<Insertable<DB[table]>>
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
      key_prefix: 'curlmd_',
      name: `Key ${Nanoid.generate()}`,
    }
  },
  organization_invite() {
    return {
      expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(), // 7 days
      token: crypto.randomUUID(),
    }
  },
  request() {
    return {
      cached: false,
      hostname: 'example.com',
      markdown_tokens: 0,
      path: '/',
      source_tokens: 0,
      source_tokens_method: 'estimated',
      url: 'https://example.com/',
    }
  },
  session() {
    return {
      expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(), // 30 days
    }
  },
}

type Factory = {
  [table in keyof DB]: {
    attrs: <const values extends readonly Record<string, unknown>[]>(
      ...args: values & AttrsValidation<table, values>
    ) => values['length'] extends 1 ? Selectable<DB[table]> : Selectable<DB[table]>[]
    insert: <const values extends readonly Record<string, unknown>[]>(
      ...args: values & AttrsValidation<table, values>
    ) => Promise<values['length'] extends 1 ? Selectable<DB[table]> : Selectable<DB[table]>[]>
  }
}

type AttrsValidation<table extends keyof DB, values extends readonly Record<string, unknown>[]> = {
  [index in keyof values]: Partial<Insertable<DB[table]>> & RequiredForeignKeys<DB[table]>
}

type RequiredForeignKeys<row> = {
  [key in keyof row as key extends `${string}_id`
    ? null extends row[key]
      ? never
      : key extends 'id' | 'provider_account_id'
        ? never
        : key
    : never]-?: row[key]
}
