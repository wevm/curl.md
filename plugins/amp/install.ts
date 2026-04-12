#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

if (isMain()) await main()

export async function installAmpPlugin(options: InstallAmpPluginOptions = {}) {
  const env = options.env || process.env
  const platform = options.platform || process.platform
  const packageJson = options.packageJson || (await readPackageJson())
  const ampConfigDir = options.ampConfigDir || getAmpConfigDir(env, platform)
  const packageSpec = `${packageJson.name}@${packageJson.version}`

  await ensurePackageJson(ampConfigDir)
  installPackage(ampConfigDir, packageSpec, options.spawnSync || spawnSync, env)
  const shimPath = await writePluginShim(ampConfigDir)

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

async function main() {
  const command = process.argv[2]
  if (command && command !== 'install') {
    console.error('Usage: pnpm dlx @curl.md/amp install')
    process.exitCode = 1
    return
  }

  try {
    const result = await installAmpPlugin()
    console.log(`Installed ${result.packageSpec}`)
    console.log(`Amp config: ${result.ampConfigDir}`)
    console.log(`Plugin shim: ${result.shimPath}`)
    console.log(
      'Next: run `amp`. If auth is needed, set `CURLMD_API_KEY` or run `curl.md auth login`.',
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

async function ensurePackageJson(ampConfigDir: string) {
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
}

function installPackage(
  ampConfigDir: string,
  packageSpec: string,
  spawn: SpawnSyncLike,
  env: NodeJS.ProcessEnv,
) {
  const result = spawn('pnpm', ['add', '--save-exact', packageSpec], {
    cwd: ampConfigDir,
    env,
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  if (result.status === 0) return
  throw new Error(`Failed to install ${packageSpec} into ${ampConfigDir}.`)
}

async function readPackageJson() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const packageJsonPath = path.join(
    currentDir,
    path.basename(currentDir) === 'dist' ? '..' : '.',
    'package.json',
  )
  return JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as PackageJson
}

async function writePluginShim(ampConfigDir: string) {
  const pluginsDir = path.join(ampConfigDir, 'plugins')
  const shimPath = path.join(pluginsDir, 'curlmd.ts')

  await fs.mkdir(pluginsDir, { recursive: true })
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

  return shimPath
}

function isMain() {
  if (!process.argv[1]) return false
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

type InstallAmpPluginOptions = {
  ampConfigDir?: string
  env?: NodeJS.ProcessEnv
  packageJson?: PackageJson
  platform?: NodeJS.Platform
  spawnSync?: SpawnSyncLike
}

type PackageJson = {
  name: string
  version: string
}

type SpawnSyncLike = (
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
