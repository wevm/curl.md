import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const isRemote = process.argv.includes('--remote')
const env = process.argv.includes('--env')
  ? process.argv[process.argv.indexOf('--env') + 1]
  : undefined

function execD1(sql: string): string {
  const envFlag = env ? `--env ${env}` : ''
  const remoteFlag = isRemote ? '--remote' : '--local'
  const cmd = `pnpm exec wrangler d1 execute curl-db ${remoteFlag} ${envFlag} --command "${sql}" --json`
  return execSync(cmd, {
    encoding: 'utf-8',
    cwd: path.resolve(import.meta.dirname, '..'),
  })
}

// Get CREATE TABLE statements
const schemaResult = JSON.parse(
  execD1(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'",
  ),
)
const tables = (
  schemaResult[0].results as { name: string; sql: string }[]
).sort((a, b) => a.name.localeCompare(b.name))

type Column = {
  name: string
  type: string
  notnull: boolean
  hasDefault: boolean
}

function parseCreateTable(sql: string): Column[] {
  const columns: Column[] = []
  const match = sql.match(/\(([\s\S]*)\)/)
  if (!match) return columns

  const body = match[1]
  let depth = 0
  let current = ''
  const parts: string[] = []

  for (const char of body) {
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current.trim())

  for (const part of parts) {
    if (/^(PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)/i.test(part)) continue

    const colMatch = part.match(/^["']?(\w+)["']?\s+(\w+)/i)
    if (!colMatch) continue

    const [, name, type] = colMatch
    const notnull = /NOT\s+NULL/i.test(part) || /PRIMARY\s+KEY/i.test(part)
    const hasDefault = /DEFAULT\s+/i.test(part)
    columns.push({ hasDefault, name, notnull, type })
  }

  return columns
}

const customTypes: Record<string, Record<string, string>> = {
  account: { role: "'crew' | 'user'" },
  organization_member: { role: "'admin' | 'member' | 'owner'" },
}

function sqliteToTs(sqlType: string, notnull: boolean): string {
  const type = sqlType.toUpperCase()
  const tsType = (() => {
    if (type.includes('INT')) return 'number'
    if (type.includes('TEXT') || type.includes('CHAR')) return 'string'
    if (
      type.includes('REAL') ||
      type.includes('FLOAT') ||
      type.includes('DOUBLE')
    )
      return 'number'
    if (type.includes('BLOB')) return 'Uint8Array'
    return 'unknown'
  })()
  return notnull ? tsType : `${tsType} | null`
}

let output = '// Auto-generated from D1 database schema\n\n'
output += "import type * as k from 'kysely'\n\n"

output += 'export interface DB {\n'
for (const { name } of tables) {
  output += `\t${name}: ${name}\n`
}
output += '}\n\n'

for (const { name, sql } of tables) {
  const columns = parseCreateTable(sql).sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  output += `type ${name} = {\n`
  for (const col of columns) {
    const custom = customTypes[name]?.[col.name]
    const baseType = custom ?? sqliteToTs(col.type, true)
    const isGenerated =
      col.name === 'id' || col.name.endsWith('_at') || col.hasDefault
    const nullableSuffix = col.notnull ? '' : ' | null'

    if (isGenerated) {
      output += `\t${col.name}: k.Generated<${baseType}${nullableSuffix}>\n`
    } else {
      output += `\t${col.name}: ${baseType}${nullableSuffix}\n`
    }
  }
  output += '}\n\n'
}

output += 'export declare namespace DB {\n'
for (const { name } of tables) {
  output += `\ttype ${name} = k.Selectable<DB["${name}"]>\n`
}
output += '\n\texport namespace Insertable {\n'
for (const { name } of tables) {
  output += `\t\ttype ${name} = k.Insertable<DB["${name}"]>\n`
}
output += '\t}\n\n\texport namespace Selectable {\n'
for (const { name } of tables) {
  output += `\t\ttype ${name} = k.Selectable<DB["${name}"]>\n`
}
output += '\t}\n\n\texport namespace Updateable {\n'
for (const { name } of tables) {
  output += `\t\ttype ${name} = k.Updateable<DB["${name}"]>\n`
}
output += '\t}\n}\n'

const outputPath = path.resolve(import.meta.dirname, '../src/lib/db.gen.ts')
fs.writeFileSync(outputPath, `${output.trimEnd()}\n`)
execSync(`pnpm exec biome format --write ${outputPath}`, {
  cwd: path.resolve(import.meta.dirname, '..'),
  stdio: 'inherit',
})
console.log('Generated src/lib/db.gen.ts')
