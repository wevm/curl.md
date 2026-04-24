import fs from 'node:fs/promises'
import path from 'node:path'

// Restores packages after publishing.

console.log('Restoring packages.')

const packageDirs = ['cli', 'plugins/amp', 'plugins/claude', 'plugins/opencode', 'plugins/pi']

for (const dir of packageDirs) {
  const packagePath = path.join(dir, 'package.json')
  const tmpPath = `${packagePath}.tmp`

  const packageJson = JSON.parse(await fs.readFile(tmpPath, 'utf-8')) as {
    name?: string | undefined
  }

  console.log(`${packageJson.name} — ${dir}`)

  await fs.writeFile(packagePath, `${JSON.stringify(packageJson, undefined, 2)}\n`, 'utf-8')
  await fs.rm(tmpPath)
  await fs.rm(path.join(dir, 'LICENSE'), { force: true })
}

console.log('Done.')
