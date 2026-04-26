import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Kysely } from 'kysely'
import { z } from 'zod'
import { dialect } from './client.ts'

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
  .innerJoin('pg_catalog.pg_namespace as namespace', 'namespace.oid', 'type.typnamespace')
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
const customTypes: Record<string, Record<string, string>> = {
  account: { role: "'crew' | 'user'" },
  credit_transaction: {
    type: "'chargeback' | 'promo' | 'purchase' | 'refund' | 'request'",
  },
  device_code: { status: "'approved' | 'pending'" },
  organization_invite: { role: "'admin' | 'member' | 'owner'" },
  organization_member: { role: "'admin' | 'member' | 'owner'" },
  request: {
    ai_agent: "'amp' | 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode' | 'pi'",
    mode: "'rush' | 'smart'",
    source_tokens_method: "'estimated' | 'html' | 'markdown'",
  },
  session: { session_type: "'browser' | 'cli'" },
}

let output = '// Auto-generated from database schema\n\n'
output += "import type * as k from 'kysely'\n\n"
output += 'type Timestamp = k.ColumnType<Date, Date | string, Date | string>\n'
output +=
  'type GeneratedTimestamp = k.ColumnType<Date, Date | string | undefined, Date | string>\n\n'

let schemaOutput = '// Auto-generated from database schema\n\n'
schemaOutput += "import { z } from 'zod'\n\n"

// TODO: Generate insert/update schemas alongside row/select schemas.

output += 'export interface DB {\n'
for (const table of publicTables) output += `\t${table.name}: ${table.name}\n`
output += '}\n\n'

const timestampTypes = new Set([
  'timestamptz',
  'timestamp',
  'timestamp with time zone',
  'timestamp without time zone',
])

for (const table of publicTables) {
  const columns = [...table.columns].sort((a, b) => a.name.localeCompare(b.name))
  const tableSchemaName = table.name
  let tableSchemaObjectOutput = `export const ${tableSchemaName} = z.object({\n`

  output += `type ${table.name} = {\n`
  for (const col of columns) {
    const custom = customTypes[table.name]?.[col.name]
    const isTimestamp = timestampTypes.has(col.dataType)
    const enumValues = enums.get(`public.${col.dataType}`)
    const customValues = custom ? parseStringUnionValues(custom) : undefined

    // Timestamp columns use rich ColumnType aliases
    if (isTimestamp) {
      const base = col.hasDefaultValue ? 'GeneratedTimestamp' : 'Timestamp'
      const suffix = col.isNullable ? ' | null' : ''
      output += `\t${col.name}: ${base}${suffix}\n`
      tableSchemaObjectOutput += `  ${col.name}: z.date()${col.isNullable ? '.nullable()' : ''},\n`
      continue
    }

    // Custom override, auto-discovered enum, or standard type mapping
    const baseType = (() => {
      if (custom) return custom
      else if (enumValues)
        return enumValues
          .sort()
          .map((v) => `'${v}'`)
          .join(' | ')
      return pgToTs(col.dataType)
    })()

    const zodType = (() => {
      if (customValues) return `z.enum([${customValues.map((value) => `'${value}'`).join(', ')}])`
      if (enumValues) {
        const sortedValues = [...enumValues].sort()
        return `z.enum([${sortedValues.map((value) => `'${value}'`).join(', ')}])`
      }
      return pgToZod(col.dataType)
    })()

    const nullableSuffix = col.isNullable ? ' | null' : ''
    const isGenerated = col.hasDefaultValue

    if (isGenerated) output += `\t${col.name}: k.Generated<${baseType}${nullableSuffix}>\n`
    else output += `\t${col.name}: ${baseType}${nullableSuffix}\n`

    tableSchemaObjectOutput += `  ${col.name}: ${zodType}${col.isNullable ? '.nullable()' : ''},\n`
  }
  output += '}\n\n'
  tableSchemaObjectOutput += '})\n'
  schemaOutput += `${tableSchemaObjectOutput}\n`
}

output += 'export declare namespace DB {\n'
for (const table of publicTables)
  output += `\ttype ${table.name} = k.Selectable<DB["${table.name}"]>\n`
output += '\n\texport namespace Insertable {\n'
for (const table of publicTables)
  output += `\t\ttype ${table.name} = k.Insertable<DB["${table.name}"]>\n`
output += '\t}\n\n\texport namespace Selectable {\n'
for (const table of publicTables)
  output += `\t\ttype ${table.name} = k.Selectable<DB["${table.name}"]>\n`
output += '\t}\n\n\texport namespace Updateable {\n'
for (const table of publicTables)
  output += `\t\ttype ${table.name} = k.Updateable<DB["${table.name}"]>\n`
output += '\t}\n}\n'

schemaOutput += 'export const db = {\n'
for (const table of publicTables) schemaOutput += `  ${table.name}: ${table.name},\n`
schemaOutput += '}\n'

writeGeneratedFile('db/types.gen.ts', output)
writeGeneratedFile('db/schemas.gen.ts', schemaOutput)

process.exit()

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

function pgToZod(dataType: string): string {
  switch (dataType) {
    case 'varchar':
    case 'text':
    case 'character varying':
      return 'z.string()'
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
      return 'z.number()'
    case 'bool':
    case 'boolean':
      return 'z.boolean()'
    case 'bytea':
      return 'z.instanceof(Uint8Array)'
    default:
      return 'z.unknown()'
  }
}

function parseStringUnionValues(value: string) {
  return [...value.matchAll(/'([^']+)'/g)].map((match) => match[1]!)
}

function writeGeneratedFile(filePath: string, output: string) {
  const outputPath = path.resolve(import.meta.dirname, '..', filePath)
  fs.writeFileSync(outputPath, `${output.trimEnd()}\n`)
  execSync(`pnpm exec oxfmt ${outputPath}`, {
    cwd: path.resolve(import.meta.dirname, '..'),
    stdio: 'inherit',
  })
  console.log(`Generated ${filePath}`)
}
