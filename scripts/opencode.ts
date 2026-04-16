import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

console.log('Launching opencode plugin.')

const root = path.resolve(import.meta.dirname, '..')
const pluginsDir = path.join(root, '.opencode', 'plugins')
const shimPath = path.join(pluginsDir, 'curlmd.ts')
const pluginSourcePath = path.join(root, 'plugins', 'opencode', 'plugin.ts')
const importPath = path.relative(pluginsDir, pluginSourcePath).split(path.sep).join('/')

mkdirSync(pluginsDir, { recursive: true })
writeFileSync(shimPath, `export { server } from ${JSON.stringify(importPath)}\n`)

execFileSync('opencode', process.argv.slice(2), {
  cwd: root,
  env: {
    ...process.env,
    CURLMD_BASE_URL: process.env.CURLMD_BASE_URL || 'https://curl.local',
    NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
  },
  stdio: 'inherit',
})

console.log('Done.')
