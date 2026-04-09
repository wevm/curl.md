import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

interface Agent {
  id: string
  fileName: string
  name: string
  install(pluginDir: string): void
  uninstall(pluginDir: string): void
  installed(pluginDir: string): boolean
}

const rootPath = fileURLToPath(import.meta.url)
const rootDir = path.dirname(rootPath)
const isSource = path.extname(rootPath) === '.ts'

export const agentIds = ['amp', 'pi'] as const

export const agents: Agent[] = [
  {
    fileName: 'amp.ts',
    id: 'amp',
    name: 'Amp',
    install(dir) {
      installPlugin(this, dir)
    },
    uninstall(dir) {
      uninstallPlugin(dir)
    },
    installed(dir) {
      return isPluginInstalled(dir)
    },
  },
  {
    fileName: 'pi.ts',
    id: 'pi',
    name: 'Pi',
    install(dir) {
      installPlugin(this, dir)
    },
    uninstall(dir) {
      uninstallPlugin(dir)
    },
    installed(dir) {
      return isPluginInstalled(dir)
    },
  },
]

export function pluginDir(agentId: string): string {
  switch (agentId) {
    case 'amp':
      return path.join(os.homedir(), '.config', 'amp', 'plugins')
    case 'pi':
      return path.join(os.homedir(), '.pi', 'agent', 'extensions')
    default:
      return ''
  }
}

export function findAgent(id: string): Agent | undefined {
  return agents.find((a) => a.id === id)
}

function installPlugin(agent: Agent, dir: string) {
  const src = isSource
    ? path.join(rootDir, '..', '..', 'plugins', agent.id, 'plugin.ts')
    : path.join(rootDir, 'plugins', agent.fileName)
  const dest = path.join(dir, 'curlmd.ts')
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(src, dest)
}

function uninstallPlugin(dir: string) {
  const dest = path.join(dir, 'curlmd.ts')
  if (fs.existsSync(dest)) fs.unlinkSync(dest)
}

function isPluginInstalled(dir: string) {
  return fs.existsSync(path.join(dir, 'curlmd.ts'))
}
