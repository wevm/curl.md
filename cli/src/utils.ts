import child_process from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import util from 'node:util'
import pc from 'picocolors'
import pkg from '../package.json' with { type: 'json' }

export function dataDir() {
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'curl-md')
  if (process.platform === 'win32')
    return path.join(process.env.LOCALAPPDATA || os.homedir(), 'curl-md')
  return path.join(os.homedir(), '.local', 'share', 'curl-md')
}

export function configDir() {
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, 'curl-md')
  if (process.platform === 'win32') return path.join(process.env.APPDATA || os.homedir(), 'curl-md')
  return path.join(os.homedir(), '.config', 'curl-md')
}

export const Session = {
  dir: () => path.join(dataDir(), 'session.json'),
  read(): Session.Data | null {
    try {
      return JSON.parse(fs.readFileSync(Session.dir(), 'utf-8'))
    } catch {
      return null
    }
  },
  write(session: Partial<Session.Data>) {
    const p = Session.dir()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    const existing = Session.read()
    const merged = { ...existing, ...session }
    fs.writeFileSync(p, JSON.stringify(merged), { mode: 0o600 })
  },
  delete() {
    try {
      fs.unlinkSync(Session.dir())
    } catch {}
  },
}

export declare namespace Session {
  export type Data = {
    session_id: string
    organization_id?: string | undefined
  }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function installGlobal(name: string, version?: string) {
  const type = detectPackageManager()
  const spec = version?.startsWith('http') ? version : `${name}@${version || 'latest'}`
  const execFileAsync = util.promisify(child_process.execFile)
  if (type === 'pnpm') return execFileAsync('pnpm', ['add', '-g', spec])
  if (type === 'bun') return execFileAsync('bun', ['add', '-g', spec])
  return execFileAsync('npm', ['install', '-g', spec])
}

import type { Client } from './types.ts'
import { createSpinner, select } from './ui.ts'
export { createSpinner, select }

export function openUrl(url: string) {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  child_process.exec(`${cmd} "${url}"`)
}

function detectPackageManager(): 'npm' | 'pnpm' | 'bun' {
  const userAgent = process.env.npm_config_user_agent || ''
  const execPath = process.env.npm_execpath || ''

  if (userAgent.includes('pnpm') || execPath.includes('pnpm')) if (hasBinary('pnpm')) return 'pnpm'
  if (userAgent.includes('bun') || execPath.includes('bun')) if (hasBinary('bun')) return 'bun'

  try {
    const bin = process.argv[1]
    if (!bin) return 'npm'
    const resolved = fs.realpathSync(bin)
    if (resolved.includes('pnpm') && hasBinary('pnpm')) return 'pnpm'
    if (resolved.includes('bun') && hasBinary('bun')) return 'bun'
  } catch {}

  return 'npm'
}

export const UpdateCache = {
  path: () => path.join(dataDir(), 'update-check.json'),
  read(): UpdateCache.Data | null {
    try {
      return JSON.parse(fs.readFileSync(UpdateCache.path(), 'utf-8'))
    } catch {
      return null
    }
  },
  write(data: UpdateCache.Data) {
    const p = UpdateCache.path()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(data))
  },
  async runUpdate(client?: Client) {
    let latest: string | undefined
    let released_at: string | null = null

    // Try curl.md API first
    if (client) {
      try {
        const res = await client.api.cli.latest.$get(
          {
            query: {
              current: pkg.version,
              os: process.platform,
              arch: process.arch,
              standalone: String(isStandalone()),
            },
          },
          { init: { signal: AbortSignal.timeout(3_000) } },
        )
        if (res.status === 200) {
          const json = await res.json()
          latest = json.version
          released_at = json.published_at ?? null
        }
      } catch {}
    }

    // Fallback: npm registry
    if (!latest) {
      const res = await fetch('https://registry.npmjs.org/curl.md', {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) process.exit(1)
      const npm = (await res.json()) as {
        'dist-tags'?: { latest?: string }
        time?: Record<string, string>
      }
      latest = npm['dist-tags']?.latest
      if (!latest) process.exit(1)
      released_at = npm.time?.[latest] ?? null
    }

    const p = UpdateCache.path()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify({ latest, released_at, checked_at: Date.now() }))
  },
  /** Spawn a detached background process to refresh the cache. */
  spawnCheck() {
    try {
      const args = isStandalone() ? [] : [process.argv[1] as string]
      const child = child_process.spawn(process.execPath, args, {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, __CURLMD_UPDATE_CACHE: '1' },
      })
      child.unref()
    } catch {}
  },
}

export declare namespace UpdateCache {
  export type Data = {
    checked_at: number
    latest: string
    released_at: string | null
  }
}

export function relativeTime(date: Date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  const seconds = Math.abs(diff)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function estimateRequests(balanceMills: number) {
  return Math.floor(balanceMills).toLocaleString()
}

export function formatValidationError(json: unknown, fallback = 'Invalid request'): string {
  if (
    typeof json !== 'object' ||
    json === null ||
    !('issues' in json) ||
    !Array.isArray(json.issues)
  )
    return fallback
  return json.issues
    .map((i: { message: string; path: string }) => `${i.path}: ${i.message}`)
    .join('\n')
}

/** Extracts `code` and `message` from an untyped API error response (e.g. wildcard routes where Hono RPC can't infer types). Returns uppercased `code`. Falls back to provided defaults if the shape doesn't match. */
export function parseApiError(json: unknown, fallback: { code: string; message: string }) {
  if (json && typeof json === 'object' && 'code' in json && 'message' in json) {
    const obj = json as { code: string; message: string }
    return { code: obj.code.toUpperCase(), message: obj.message }
  }
  return fallback
}

export function isStandalone(): boolean {
  return !/^(node|bun)(\.exe)?$/.test(path.basename(process.execPath))
}

export async function updateStandalone(version: string, aliases: string[]) {
  const os_ = (() => {
    if (process.platform === 'darwin') return 'darwin'
    if (process.platform === 'win32') return 'windows'
    return 'linux'
  })()
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const ext = os_ === 'windows' ? '.exe' : ''
  const artifact = `curl.md-${os_}-${arch}${ext}`
  const tag = `curl.md@${version}`
  const repo = 'wevm/curl.md'
  const url = `https://github.com/${repo}/releases/download/${tag}/${artifact}`

  const buffer = await (async () => {
    // Try direct download first (works for public repos)
    const res = await fetch(url, { redirect: 'follow' })
    if (res.ok) return Buffer.from(await res.arrayBuffer())

    // Fallback: use gh CLI for authenticated downloads (private repos)
    try {
      const tmpfile = path.join(os.tmpdir(), artifact)
      child_process.execFileSync('gh', [
        'release',
        'download',
        tag,
        '--repo',
        repo,
        '--pattern',
        artifact,
        '--output',
        tmpfile,
        '--clobber',
      ])
      const buf = fs.readFileSync(tmpfile)
      fs.unlinkSync(tmpfile)
      return buf
    } catch {}

    throw new Error(`Download failed (${res.status}). Binary may not exist for ${os_}/${arch}.`)
  })()
  const target = process.execPath
  const tmpPath = `${target}.tmp`
  fs.writeFileSync(tmpPath, buffer, { mode: 0o755 })
  fs.renameSync(tmpPath, target)

  symlinkAliases(target, aliases)
}

function symlinkAliases(target: string, aliases: string[]) {
  if (process.platform === 'win32') return
  const dir = path.dirname(target)
  for (const alias of aliases) {
    const link = path.join(dir, alias)
    if (link === target) continue
    try {
      const existing = fs.readlinkSync(link)
      if (existing === target) continue
    } catch {}
    try {
      fs.unlinkSync(link)
    } catch {}
    try {
      fs.symlinkSync(target, link)
    } catch {}
  }
}

function hasBinary(name: string) {
  try {
    const cmd = process.platform === 'win32' ? 'where.exe' : 'which'
    child_process.execFileSync(cmd, [name], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export async function pollForBalance(
  client: Client,
  initialBalance: number,
  spinner: ReturnType<typeof createSpinner>,
  signal?: AbortSignal,
): Promise<string | null> {
  let delay = 500
  const timeout = Date.now() + 120_000
  while (Date.now() < timeout) {
    if (signal?.aborted) {
      spinner.stop()
      return null
    }
    await new Promise((r) => {
      const t = setTimeout(r, delay)
      signal?.addEventListener('abort', () => {
        clearTimeout(t)
        r(undefined)
      })
    })
    if (signal?.aborted) {
      spinner.stop()
      return null
    }
    const res = await client.api.credits.$get()
    if (res.status === 200) {
      const json = await res.json()
      if (json.balance_mills > initialBalance) {
        spinner.stop()
        const dollars = (json.balance_mills / 1000).toFixed(3)
        return `Credits added. New balance: ${pc.bold(pc.green(`$${dollars}`))}`
      }
    }
    delay = Math.min(delay * 2, 5_000)
  }
  spinner.stop()
  return 'Payment may still be processing. Run `credits check` to verify.'
}

export async function pollWithCancel(
  client: Client,
  initialBalance: number,
  spinnerOrMessage?: ReturnType<typeof createSpinner> | string,
) {
  const spinner =
    typeof spinnerOrMessage === 'object'
      ? spinnerOrMessage
      : createSpinner(spinnerOrMessage ?? 'Adding credits')
  const abort = new AbortController()
  const onSignal = () => abort.abort()
  process.on('SIGINT', onSignal)
  try {
    return await pollForBalance(client, initialBalance, spinner, abort.signal)
  } finally {
    process.off('SIGINT', onSignal)
    spinner.stop()
  }
}
