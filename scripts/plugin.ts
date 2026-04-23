import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const providers = getProviders()
const root = path.resolve(import.meta.dirname, '..')
const providerName = (() => {
  const value = process.argv[2]
  if (value === 'amp' || value === 'claude' || value === 'opencode' || value === 'pi') return value
  console.error(`Usage: node scripts/plugin.ts <${Object.keys(providers).join('|')}> [args...]`)
  process.exit(1)
})()

console.log(`Launching ${providerName} plugin.`)

const runtime = providers[providerName](root) as ProviderRuntime

try {
  execFileSync(runtime.command, [...(runtime.args || []), ...process.argv.slice(3)], {
    cwd: root,
    env: {
      ...process.env,
      ...runtime.env,
    },
    stdio: 'inherit',
  })
} finally {
  runtime.cleanup?.()
}

console.log('Done.')

////////////////////////////////////////////////////////////////////////////////////////////////

function getProviders() {
  return {
    amp(root) {
      const pluginsDir = path.join(root, '.amp', 'plugins')
      const legacyShimPath = path.join(pluginsDir, 'curlmd.js')
      const pluginSourcePath = path.join(root, 'plugins', 'amp', 'src', 'plugin.ts')
      const shimPath = path.join(pluginsDir, 'curlmd.ts')

      mkdirSync(pluginsDir, { recursive: true })
      rmSync(legacyShimPath, { force: true })
      rmSync(shimPath, { force: true })
      symlinkSync(path.relative(pluginsDir, pluginSourcePath), shimPath)

      return {
        command: 'amp',
        env: {
          AI_AGENT: process.env.AI_AGENT || 'amp',
          CURLMD_BASE_URL: process.env.CURLMD_BASE_URL || 'https://curl.local',
          NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
          PLUGINS: process.env.PLUGINS || 'all',
        },
      }
    },
    claude(root) {
      const pluginDir = path.join(root, 'plugins', 'claude')
      return {
        args: ['--plugin-dir', pluginDir],
        command: 'claude',
        env: {
          CURLMD_BASE_URL: process.env.CURLMD_BASE_URL || 'https://curl.local',
          NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
        },
      }
    },
    opencode(root) {
      const pluginsDir = path.join(root, '.opencode', 'plugins')
      const pluginSourcePath = path.join(root, 'plugins', 'opencode', 'src', 'server.ts')
      const projectTuiConfigPath = path.join(root, 'tui.json')
      const shimPath = path.join(pluginsDir, 'curlmd.ts')
      const tempTuiConfigDir = mkdtempSync(path.join(os.tmpdir(), 'curlmd-opencode-'))
      const tempTuiConfigPath = path.join(tempTuiConfigDir, 'tui.json')
      const tuiPluginPath = pathToFileURL(
        path.join(root, 'plugins', 'opencode', 'src', 'tui.ts'),
      ).href
      const importPath = path.relative(pluginsDir, pluginSourcePath).split(path.sep).join('/')
      const tuiConfig = (() => {
        const config = (() => {
          if (!existsSync(projectTuiConfigPath)) return null
          try {
            return JSON.parse(readFileSync(projectTuiConfigPath, 'utf8')) as Record<string, unknown>
          } catch {
            return null
          }
        })()
        const plugin = Array.isArray(config?.plugin) ? [...config.plugin] : []
        if (!plugin.includes(tuiPluginPath)) plugin.push(tuiPluginPath)
        if (!config)
          return {
            $schema: 'https://opencode.ai/tui.json',
            plugin,
          }
        return {
          ...config,
          $schema: 'https://opencode.ai/tui.json',
          plugin,
        }
      })()

      mkdirSync(pluginsDir, { recursive: true })
      writeFileSync(shimPath, `export { plugin } from ${JSON.stringify(importPath)}\n`)
      writeFileSync(tempTuiConfigPath, `${JSON.stringify(tuiConfig)}\n`)

      return {
        cleanup: () => rmSync(tempTuiConfigDir, { force: true, recursive: true }),
        command: 'opencode',
        env: {
          CURLMD_BASE_URL: process.env.CURLMD_BASE_URL || 'https://curl.local',
          NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
          OPENCODE_TUI_CONFIG: tempTuiConfigPath,
        },
      }
    },
    pi(root) {
      const extensionPath = path.join(root, 'plugins', 'pi', 'src', 'index.ts')
      return {
        args: ['--no-extensions', '-e', extensionPath],
        command: 'pi',
        env: {
          CURLMD_BASE_URL: process.env.CURLMD_BASE_URL || 'https://curl.local',
          NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
        },
      }
    },
  } satisfies Record<ProviderName, (root: string) => ProviderRuntime>
}

type ProviderName = 'amp' | 'claude' | 'opencode' | 'pi'
type ProviderRuntime = {
  args?: string[]
  cleanup?: () => void
  command: string
  env: Record<string, string | undefined>
}
