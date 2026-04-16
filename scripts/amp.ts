import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, symlinkSync } from 'node:fs'
import path from 'node:path'

console.log('Launching amp plugin.')

const root = path.resolve(import.meta.dirname, '..')
const pluginsDir = path.join(root, '.amp', 'plugins')
const legacyShimPath = path.join(pluginsDir, 'curlmd.js')
const shimPath = path.join(pluginsDir, 'curlmd.ts')
const pluginSourcePath = path.join(root, 'plugins', 'amp', 'plugin.ts')

mkdirSync(pluginsDir, { recursive: true })
rmSync(legacyShimPath, { force: true })
rmSync(shimPath, { force: true })
symlinkSync(path.relative(pluginsDir, pluginSourcePath), shimPath)

execFileSync('amp', process.argv.slice(2), {
  cwd: root,
  env: {
    ...process.env,
    AI_AGENT: process.env.AI_AGENT || 'amp',
    CURLMD_BASE_URL: process.env.CURLMD_BASE_URL || 'https://curl.local',
    NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
    PLUGINS: process.env.PLUGINS || 'all',
  },
  stdio: 'inherit',
})

console.log('Done.')
