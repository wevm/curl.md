import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Agent {
  id: string
  name: string
  install(pluginDir: string): void
  uninstall(pluginDir: string): void
  installed(pluginDir: string): boolean
}

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export const agentIds = ['amp', 'claude', 'codex', 'pi'] as const

export const agents: Agent[] = [
  {
    id: 'amp',
    name: 'Amp',
    install(dir) {
      const src = path.join(rootDir, 'amp.ts')
      const dest = path.join(dir, 'curlmd.ts')
      fs.mkdirSync(dir, { recursive: true })
      fs.copyFileSync(src, dest)
    },
    uninstall(dir) {
      const dest = path.join(dir, 'curlmd.ts')
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
    },
    installed(dir) {
      return fs.existsSync(path.join(dir, 'curlmd.ts'))
    },
  },
  {
    id: 'claude',
    name: 'Claude Code',
    install() {
      throw new Error('Claude Code plugin not yet implemented')
    },
    uninstall() {
      throw new Error('Claude Code plugin not yet implemented')
    },
    installed() {
      return false
    },
  },
  {
    id: 'codex',
    name: 'Codex',
    install() {
      throw new Error('Codex plugin not yet implemented')
    },
    uninstall() {
      throw new Error('Codex plugin not yet implemented')
    },
    installed() {
      return false
    },
  },
  {
    id: 'pi',
    name: 'Pi',
    install() {
      throw new Error('Pi plugin not yet implemented')
    },
    uninstall() {
      throw new Error('Pi plugin not yet implemented')
    },
    installed() {
      return false
    },
  },
]

export function pluginDir(agentId: string): string {
  switch (agentId) {
    case 'amp':
      return path.join(os.homedir(), '.config', 'amp', 'plugins')
    case 'claude':
      return path.join(os.homedir(), '.claude')
    case 'pi':
      return path.join(os.homedir(), '.pi', 'extensions')
    default:
      return ''
  }
}

export function findAgent(id: string): Agent | undefined {
  return agents.find((a) => a.id === id)
}
