import fs from 'node:fs/promises'
import path from 'node:path'

// Formats packages for publishing.

console.log('Formatting packages.')

const packageDirs = ['cli', 'plugins/amp', 'plugins/pi']

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
  const { devDependencies: _d, imports: _i, scripts: _s, ...rest } = packageJson
  if (rest.bin)
    for (const key of Object.keys(rest.bin)) if (key.endsWith('.src')) delete rest.bin[key]

  await fs.writeFile(packagePath, `${JSON.stringify(rest, undefined, 2)}\n`, 'utf-8')
}

console.log('Done.')
