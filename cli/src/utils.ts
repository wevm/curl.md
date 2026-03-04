import child_process from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import util from 'node:util'
import { pc } from './picocolors.ts'

export type Command = { command: string; description?: string }

export function dataDir() {
  return path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
    'curl-md',
  )
}

export function configDir() {
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    'curl-md',
  )
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
  type Data = {
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

export async function fetchLatestVersion(name: string): Promise<string> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return 'latest'
    const pkg = (await res.json()) as { version?: string }
    return pkg.version ?? 'latest'
  } catch {
    return 'latest'
  } finally {
    clearTimeout(timeout)
  }
}

export function installGlobal(name: string, version?: string) {
  const type = detectPackageManager()
  const spec = version?.startsWith('http')
    ? version
    : `${name}@${version || 'latest'}`
  const execFileAsync = util.promisify(child_process.execFile)
  if (type === 'pnpm') return execFileAsync('pnpm', ['add', '-g', spec])
  if (type === 'bun') return execFileAsync('bun', ['add', '-g', spec])
  return execFileAsync('npm', ['install', '-g', spec])
}

// Vendored ANSI spinner (inspired by Vitest's windowed renderer)
const ANSI_CLEAR_LINE = '\x1B[2K'
const ANSI_CURSOR_TO_START = '\x1B[G'
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function createSpinner(message: string) {
  let frame = 0
  const interval = setInterval(() => {
    const symbol = pc.cyan(SPINNER_FRAMES[frame])
    process.stderr.write(
      `${ANSI_CURSOR_TO_START}${ANSI_CLEAR_LINE}${symbol} ${message}`,
    )
    frame = (frame + 1) % SPINNER_FRAMES.length
  }, 80).unref()

  return {
    stop() {
      clearInterval(interval)
      process.stderr.write(`${ANSI_CURSOR_TO_START}${ANSI_CLEAR_LINE}`)
    },
  }
}

export function openUrl(url: string) {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open'
  child_process.exec(`${cmd} "${url}"`)
}

function detectPackageManager(): 'npm' | 'pnpm' | 'bun' {
  const userAgent = process.env.npm_config_user_agent || ''
  const execPath = process.env.npm_execpath || ''

  if (userAgent.includes('pnpm') || execPath.includes('pnpm'))
    if (hasBinary('pnpm')) return 'pnpm'
  if (userAgent.includes('bun') || execPath.includes('bun'))
    if (hasBinary('bun')) return 'bun'

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
  /** Spawn a detached background process to refresh the cache. */
  spawnCheck() {
    try {
      const script = new URL('./update-cache.js', import.meta.url).pathname
      const child = child_process.spawn(process.execPath, [script], {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
    } catch {}
  },
}

export declare namespace UpdateCache {
  type Data = {
    checked_at: number
    latest: string
    released_at: string | null
  }
}

export function relativeTime(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function select(title: string, items: string[]): Promise<number> {
  return new Promise((resolve) => {
    let cursor = 0
    const write = (s: string) => process.stderr.write(s)

    function renderItem(i: number) {
      const item = items[i] ?? ''
      const indicator = i === cursor ? pc.cyan('❯') : ' '
      const label = i === cursor ? pc.cyan(item) : item
      return `  ${indicator} ${label}\n`
    }

    function render() {
      write(`\x1b[${items.length}A`)
      for (let i = 0; i < items.length; i++) write(`\x1b[2K${renderItem(i)}`)
    }

    write(`\n${title}\n`)
    for (let i = 0; i < items.length; i++) write(renderItem(i))

    process.stdin.setRawMode(true)
    process.stdin.resume()

    function onData(buf: Buffer) {
      const key = buf.toString()
      if (key === '\x1b[A') cursor = Math.max(0, cursor - 1)
      else if (key === '\x1b[B') cursor = Math.min(items.length - 1, cursor + 1)
      else if (key === '\r' || key === '\n') return done(cursor)
      else if (key === '\x03' || key === '\x1b') return done(-1)
      else return
      render()
    }

    function done(index: number) {
      process.stdin.off('data', onData)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      resolve(index)
    }

    process.stdin.on('data', onData)
  })
}

export function formatValidationError(
  json: unknown,
  fallback = 'Invalid request',
): string {
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

function hasBinary(name: string) {
  try {
    child_process.execFileSync('which', [name], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
