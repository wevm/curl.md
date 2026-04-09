import fs from 'node:fs/promises'
import path from 'node:path'

// Formats package.json files for publishing by removing dev-only fields.

const packageDirs = ['cli', 'plugins/pi']

for (const dir of packageDirs) {
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
  if (dir === 'cli') {
    rest.exports = {
      '.': {
        default: './dist/index.js',
        types: './dist-types/cli/src/index.d.ts',
      },
    }
    rest.types = './dist-types/cli/src/index.d.ts'
  }

  await fs.writeFile(packagePath, `${JSON.stringify(rest, undefined, 2)}\n`, 'utf-8')
}

console.log('Done.')
