import fs from 'node:fs/promises'

// Formats cli/package.json for publishing by removing dev-only fields.

const packagePath = 'package.json'

console.log('Formatting package.json.')

type Package = Record<string, unknown> & {
  bin?: Record<string, string> | undefined
  name?: string | undefined
}
const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf-8')) as Package

console.log(`${packageJson.name} — cli`)

// Save backup
await fs.writeFile(`${packagePath}.tmp`, `${JSON.stringify(packageJson, undefined, 2)}\n`, 'utf-8')

// Remove dev-only fields
const { devDependencies: _d, imports: _i, scripts: _s, ...rest } = packageJson
if (rest.bin)
  for (const key of Object.keys(rest.bin)) if (key.endsWith('.src')) delete rest.bin[key]

await fs.writeFile(packagePath, `${JSON.stringify(rest, undefined, 2)}\n`, 'utf-8')

console.log('Done.')
