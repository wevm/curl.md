#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const isMain = (() => {
  if (!process.argv[1]) return false
  const entryPath = (() => {
    try {
      return realpathSync(process.argv[1])
    } catch {
      return path.resolve(process.argv[1])
    }
  })()
  const modulePath = (() => {
    try {
      return realpathSync(fileURLToPath(import.meta.url))
    } catch {
      return path.resolve(fileURLToPath(import.meta.url))
    }
  })()
  return entryPath === modulePath
})()
if (isMain) {
  const command = process.argv[2]
  if (command && command !== 'install') {
    console.error('Usage: curlmd-amp install')
    process.exitCode = 1
  } else {
    try {
      const result = await installAmpPlugin()
      console.log(`Installed ${result.packageSpec} to ${result.ampConfigDir}`)
      console.log(`Plugin shim: ${result.shimPath}`)
      console.log("Run 'PLUGINS=all amp' to load plugins")
      console.log('If auth is needed, set `CURLMD_API_KEY` or run `curl.md auth login`.')
    } catch (error) {
      console.error(`error: ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 1
    }
  }
}

export async function installAmpPlugin(
  options: {
    ampConfigDir?: string
    env?: NodeJS.ProcessEnv
    packageJson?: {
      name: string
      version: string
    }
    platform?: NodeJS.Platform
    spawnSync?: (
      command: string,
      args: string[],
      options: {
        cwd: string
        env: NodeJS.ProcessEnv
        stdio: 'inherit'
      },
    ) => {
      error?: Error
      status: number | null
    }
  } = {},
) {
  const env = options.env || process.env
  const platform = options.platform || process.platform
  const ampConfigDir = options.ampConfigDir || getAmpConfigDir(env, platform)

  // Resolve the published package/version we should install into Amp's config dir.
  const packageJson =
    options.packageJson ||
    (JSON.parse(
      await fs.readFile(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          path.basename(path.dirname(fileURLToPath(import.meta.url))) === 'dist' ? '..' : '.',
          'package.json',
        ),
        'utf8',
      ),
    ) as {
      name: string
      version: string
    })
  const packageSpec = `${packageJson.name}@${packageJson.version}`

  console.log(`Preparing Amp config in ${ampConfigDir}`)

  // Amp expects a standalone package root it can resolve plugins from.
  await fs.mkdir(ampConfigDir, { recursive: true })
  const packageJsonPath = path.join(ampConfigDir, 'package.json')
  try {
    await fs.access(packageJsonPath)
  } catch {
    await fs.writeFile(
      packageJsonPath,
      `${JSON.stringify({ name: 'amp-plugins', private: true }, undefined, 2)}\n`,
      'utf8',
    )
  }

  console.log(`Installing ${packageSpec}`)

  // Install the plugin package into that config-local node_modules.
  const result = (options.spawnSync || spawnSync)(
    platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--silent', '--save-exact', packageSpec],
    {
      cwd: ampConfigDir,
      env,
      stdio: 'inherit',
    },
  )
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Failed to install ${packageSpec} into ${ampConfigDir}.`)

  // Register the plugin by writing the shim file Amp loads from ~/.config/amp/plugins.
  const shimPath = path.join(ampConfigDir, 'plugins', 'curlmd.ts')
  console.log(`Writing plugin shim to ${shimPath}`)
  await fs.mkdir(path.dirname(shimPath), { recursive: true })
  await fs.writeFile(
    shimPath,
    [
      '// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now',
      "import plugin from '@curl.md/amp'",
      '',
      'export default plugin',
      '',
    ].join('\n'),
    'utf8',
  )

  return { ampConfigDir, packageSpec, shimPath }
}

export function getAmpConfigDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
) {
  if (env.AMP_CONFIG_DIR) return env.AMP_CONFIG_DIR
  if (platform === 'win32') {
    const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'amp')
  }

  const configHome = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(configHome, 'amp')
}
