import { exec } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pc } from './picocolors.ts'

export type SessionData = {
  session_id: string
  organization_id?: string | undefined
}

export const Session = {
  read(): SessionData | null {
    try {
      return JSON.parse(fs.readFileSync(configPath(), 'utf-8'))
    } catch {
      return null
    }
  },
  write(session: Partial<SessionData>) {
    const p = configPath()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    const existing = Session.read()
    const merged = { ...existing, ...session }
    fs.writeFileSync(p, JSON.stringify(merged), { mode: 0o600 })
  },
  delete() {
    try {
      fs.unlinkSync(configPath())
    } catch {}
  },
}

function configPath() {
  return path.join(os.homedir(), '.config', 'curl-md', 'session.json')
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
  exec(`${cmd} "${url}"`)
}
