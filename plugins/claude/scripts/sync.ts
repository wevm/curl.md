import fs from 'node:fs/promises'
import path from 'node:path'

console.log('Syncing Claude plugin manifests.')

const pluginRoot = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(pluginRoot, '../..')

const packageJsonPath = path.join(pluginRoot, 'package.json')
const pluginJsonPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json')
const marketplaceJsonPath = path.join(repoRoot, 'public/claude.json')

const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
  name: string
  version: string
}

const pluginJson = JSON.parse(await fs.readFile(pluginJsonPath, 'utf8')) as PluginManifest

const pluginManifest = {
  ...pluginJson,
  version: packageJson.version,
} satisfies PluginManifest

const marketplaceManifest = {
  name: pluginManifest.name,
  owner: pluginManifest.author,
  plugins: [
    {
      author: pluginManifest.author,
      description: pluginManifest.description,
      homepage: pluginManifest.homepage,
      license: pluginManifest.license,
      name: pluginManifest.name,
      repository: pluginManifest.repository,
      source: {
        package: packageJson.name,
        source: 'npm',
      },
      version: packageJson.version,
    },
  ],
}

await fs.writeFile(pluginJsonPath, `${JSON.stringify(pluginManifest, undefined, 2)}\n`, 'utf8')
await fs.writeFile(
  marketplaceJsonPath,
  `${JSON.stringify(marketplaceManifest, undefined, 2)}\n`,
  'utf8',
)

console.log('Done.')

type PluginManifest = {
  author?: {
    email?: string | undefined
    name: string
  }
  description: string
  homepage?: string | undefined
  hooks?: Record<string, unknown>
  license?: string | undefined
  name: string
  repository?: string | undefined
  userConfig?: Record<string, unknown>
  version: string
}
