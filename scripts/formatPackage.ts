import fs from 'node:fs/promises'
import path from 'node:path'

// Formats packages for publishing.

console.log('Formatting packages.')

const packageDirs = ['cli', 'plugins/amp', 'plugins/claude', 'plugins/opencode', 'plugins/pi']

for (const dir of packageDirs) {
  await fs.copyFile('LICENSE', path.join(dir, 'LICENSE'))

  const packagePath = path.join(dir, 'package.json')
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf-8')) as Record<
    string,
    unknown
  > & {
    bin?: Record<string, string> | undefined
    name?: string | undefined
  }

  console.log(`${packageJson.name} — ${dir}`)

  // Save backup
  await fs.writeFile(
    `${packagePath}.tmp`,
    `${JSON.stringify(packageJson, undefined, 2)}\n`,
    'utf-8',
  )

  // Remove dev-only fields
  const { devDependencies: _d, scripts: _s, ...rest } = packageJson
  if (rest.bin)
    for (const key of Object.keys(rest.bin)) if (key.endsWith('.src')) delete rest.bin[key]
  if (rest.name === 'curl.md' && isObject(rest.imports))
    rest.imports = Object.fromEntries(
      Object.entries(rest.imports)
        .filter(([key]) => !key.startsWith('#test/'))
        .map(([key, value]) => [key, formatImport(key, value)]),
    )

  await fs.writeFile(packagePath, `${JSON.stringify(rest, undefined, 2)}\n`, 'utf-8')
}

console.log('Done.')

function formatImport(key: string, value: unknown) {
  if (!isObject(value)) return value
  const types = formatImportTarget(key, value.types)
  if (!types) return value
  return { ...value, default: types, types }
}

function formatImportTarget(key: string, value: unknown) {
  if (key === '#db/client.ts') return './src/shims.d.ts'
  if (typeof value !== 'string') return undefined
  return value
    .replace(/^\.\/dist\/src\/(.*)\.tsx?$/, './dist/src/$1.d.ts')
    .replace(/^\.\/dist\/db\/(.*)\.ts$/, './dist/db/$1.d.ts')
    .replace(/^\.\.\/src\/(.*)\.tsx?$/, './dist/src/$1.d.ts')
    .replace(/^\.\.\/db\/(.*)\.ts$/, './dist/db/$1.d.ts')
    .replace(/^\.\.\/src\/(.*)$/, './dist/src/$1')
    .replace(/^\.\.\/db\/(.*)$/, './dist/db/$1')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
