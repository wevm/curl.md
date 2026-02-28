import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Kysely } from 'kysely'
import { z } from 'zod'
import { dialect } from '../src/lib/pg.ts'

const env = z.parse(z.object({ DB_URL: z.string() }), process.env)

const db = new Kysely<{
  'pg_catalog.pg_namespace': { nspname: string; oid: number }
  pg_enum: { enumlabel: string; enumtypid: number }
  pg_type: { oid: number; typname: string; typnamespace: number }
}>({ dialect: dialect(env.DB_URL) })

const tables = await db.introspection.getTables()
const publicTables = tables
  .filter((t) => t.schema === 'public')
  .sort((a, b) => a.name.localeCompare(b.name))

// Auto-discover Postgres enum types
const enums = await db
  .selectFrom('pg_type as type')
  .innerJoin('pg_enum as enum', 'type.oid', 'enum.enumtypid')
  .innerJoin(
    'pg_catalog.pg_namespace as namespace',
    'namespace.oid',
    'type.typnamespace',
  )
  .select(['namespace.nspname', 'type.typname', 'enum.enumlabel'])
  .execute()
  .then((rows) => {
    const values = new Map<string, string[]>()
    for (const row of rows) {
      const key = `${row.nspname}.${row.typname}`
      values.set(key, [...(values.get(key) ?? []), row.enumlabel])
    }
    return values
  })
  .catch(() => new Map<string, string[]>())

// Override types for varchar columns with known enum-like values
const customTypes: Record<string, Record<string, string>> = {}

const timestampTypes = new Set([
  'timestamptz',
  'timestamp',
  'timestamp with time zone',
  'timestamp without time zone',
])

function pgToTs(dataType: string): string {
  switch (dataType) {
    case 'varchar':
    case 'text':
    case 'character varying':
      return 'string'
    case 'int4':
    case 'integer':
    case 'int':
    case 'smallint':
    case 'bigint':
    case 'float4':
    case 'float8':
    case 'real':
    case 'double precision':
    case 'numeric':
      return 'number'
    case 'bool':
    case 'boolean':
      return 'boolean'
    case 'bytea':
      return 'Uint8Array'
    default:
      return 'unknown'
  }
}

let output = '// Auto-generated from database schema\n\n'
output += "import type * as k from 'kysely'\n\n"
output += 'type Timestamp = k.ColumnType<Date, Date | string, Date | string>\n'
output +=
  'type GeneratedTimestamp = k.ColumnType<Date, Date | string | undefined, Date | string>\n\n'

output += 'export interface DB {\n'
for (const table of publicTables) {
  output += `\t${table.name}: ${table.name}\n`
}
output += '}\n\n'

for (const table of publicTables) {
  const columns = [...table.columns].sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  output += `type ${table.name} = {\n`
  for (const col of columns) {
    const custom = customTypes[table.name]?.[col.name]
    const isTimestamp = timestampTypes.has(col.dataType)
    const enumValues = enums.get(`public.${col.dataType}`)

    // Timestamp columns use rich ColumnType aliases
    if (isTimestamp) {
      const base = col.hasDefaultValue ? 'GeneratedTimestamp' : 'Timestamp'
      const suffix = col.isNullable ? ' | null' : ''
      output += `\t${col.name}: ${base}${suffix}\n`
      continue
    }

    // Custom override, auto-discovered enum, or standard type mapping
    let baseType: string
    if (custom) baseType = custom
    else if (enumValues)
      baseType = enumValues
        .sort()
        .map((v) => `'${v}'`)
        .join(' | ')
    else baseType = pgToTs(col.dataType)

    const nullableSuffix = col.isNullable ? ' | null' : ''
    const isGenerated = col.hasDefaultValue

    if (isGenerated) {
      output += `\t${col.name}: k.Generated<${baseType}${nullableSuffix}>\n`
    } else {
      output += `\t${col.name}: ${baseType}${nullableSuffix}\n`
    }
  }
  output += '}\n\n'
}

output += 'export declare namespace DB {\n'
for (const table of publicTables) {
  output += `\ttype ${table.name} = k.Selectable<DB["${table.name}"]>\n`
}
output += '\n\texport namespace Insertable {\n'
for (const table of publicTables) {
  output += `\t\ttype ${table.name} = k.Insertable<DB["${table.name}"]>\n`
}
output += '\t}\n\n\texport namespace Selectable {\n'
for (const table of publicTables) {
  output += `\t\ttype ${table.name} = k.Selectable<DB["${table.name}"]>\n`
}
output += '\t}\n\n\texport namespace Updateable {\n'
for (const table of publicTables) {
  output += `\t\ttype ${table.name} = k.Updateable<DB["${table.name}"]>\n`
}
output += '\t}\n}\n'

const outputPath = path.resolve(import.meta.dirname, '../src/lib/db.gen.ts')
fs.writeFileSync(outputPath, `${output.trimEnd()}\n`)
execSync(`pnpm exec biome format --write ${outputPath}`, {
  cwd: path.resolve(import.meta.dirname, '..'),
  stdio: 'inherit',
})
console.log('Generated src/lib/db.gen.ts')

process.exit()
