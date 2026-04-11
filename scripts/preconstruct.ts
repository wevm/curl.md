import fs from 'node:fs/promises'
import path from 'node:path'

console.log('Setting up packages for development.')

const packageDirs = ['cli']

for (const dir of packageDirs) {
  const packagePath = path.join(dir, 'package.json')
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf-8')) as {
    exports?: Record<string, { default?: string | undefined; types?: string | undefined } | string>
    name?: string | undefined
  }
  if (!packageJson.exports) continue

  console.log(`${packageJson.name} — ${dir}`)

  for (const [key, value] of Object.entries(packageJson.exports)) {
    if (typeof value === 'string') continue

    await linkExport(dir, key, value.default)
    await linkExport(dir, key, value.types)
  }
}

console.log('Done.')

async function linkExport(dir: string, key: string, exportPath: string | undefined) {
  if (!exportPath) return

  const sourcePath = resolveSourcePath(dir, key, exportPath)
  const outputPath = path.join(dir, exportPath)
  await fs.rm(outputPath, { force: true })
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.symlink(path.resolve(sourcePath), outputPath, 'file')
}

function resolveSourcePath(dir: string, key: string, exportPath: string) {
  const sourceDir = path.join(
    dir,
    path
      .dirname(exportPath)
      .replace(/^\.\/dist/, 'src')
      .replace(/^dist/, 'src'),
  )
  const sourceFileName = key === '.' ? 'index.ts' : `${path.basename(key)}.ts`
  return path.join(sourceDir, sourceFileName)
}
