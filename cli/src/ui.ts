import pc from 'picocolors'
import { relativeTime } from './utils.ts'

export function table(headers: string[], rows: string[][]): string {
  const allRows = [headers, ...rows]
  const colWidths = headers.map((_, col) =>
    Math.max(...allRows.map((row) => stripAnsi(row[col] ?? '').length)),
  )

  const indent = 0
  const gap = 3
  const termWidth = process.stdout.columns || 80
  const totalGaps = (headers.length - 1) * gap
  const naturalWidth = indent + colWidths.reduce((a, b) => a + b, 0) + totalGaps
  const overflow = naturalWidth - termWidth

  if (overflow > 0) {
    let remaining = overflow
    // Shrink widest columns first, minimum 4 chars (3 for "..." + 1 char)
    const minWidth = 4
    const sortedIndices = colWidths
      .map((w, i) => ({ w, i }))
      .sort((a, b) => b.w - a.w)
      .map(({ i }) => i)

    for (const idx of sortedIndices) {
      if (remaining <= 0) break
      const w = colWidths[idx] ?? 0
      const shrink = Math.min(remaining, w - minWidth)
      if (shrink > 0) {
        colWidths[idx] = w - shrink
        remaining -= shrink
      }
    }
  }

  const formatRow = (row: string[], dim: boolean) =>
    `${row
      .map((cell, i) => {
        const maxW = colWidths[i] ?? 0
        const visible = stripAnsi(cell)
        const truncated = visible.length > maxW ? truncateAnsi(cell, maxW - 3) + '\x1b[0m...' : cell
        const pad = maxW - stripAnsi(truncated).length
        const padded = truncated + ' '.repeat(Math.max(0, pad))
        return dim ? pc.dim(padded) : padded
      })
      .join('   ')}`

  return [formatRow(headers, true), ...rows.map((row) => formatRow(row, false))].join('\n')
}

export function summary(fields: [string, string][], title?: string): string {
  const maxLabel = Math.max(...fields.map(([label]) => label.length))
  const lines = fields.map(([label, value]) => `${pc.dim(label.padStart(maxLabel))}   ${value}`)
  if (!title) return lines.join('\n')
  return [pc.bold(title), '', ...lines].join('\n')
}

export function callout(message: string): string {
  return pc.yellow(message)
}

export async function confirm(message: string): Promise<boolean> {
  const prompt = `${pc.green('?')} ${pc.bold(message)} (y/N) `
  process.stderr.write(prompt)

  return new Promise((resolve) => {
    process.stdin.setRawMode(true)
    process.stdin.resume()

    function onData(buf: Buffer) {
      const key = buf.toString()
      process.stdin.off('data', onData)
      process.stdin.setRawMode(false)
      process.stdin.pause()

      const yes = ['y', 'Y', 'yes', 'YES'].includes(key.trim() || key)
      const label = yes ? 'Yes' : 'No'
      process.stderr.write(
        `${ANSI_CURSOR_TO_START}${ANSI_CLEAR_LINE}${pc.green('?')} ${pc.bold(message)} ${pc.cyan(label)}\n`,
      )
      resolve(yes)
    }

    process.stdin.on('data', onData)
  })
}

export function formatAbsoluteDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDate(date: Date): string {
  const rel = relativeTime(date)
  if (rel === 'now') return 'now'

  const abs = formatAbsoluteDate(date)

  const diffMs = Date.now() - date.getTime()
  const hours = Math.abs(diffMs) / (1000 * 60 * 60)

  if (hours < 24) {
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return `${rel} ${pc.dim(`(${abs} ${hh}:${mm})`)}`
  }

  return `${rel} ${pc.dim(`(${abs})`)}`
}

const ANSI_CLEAR_LINE = '\x1B[2K'
const ANSI_CURSOR_TO_START = '\x1B[G'
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function createSpinner(message: string) {
  if (!process.stderr.isTTY) {
    process.stderr.write(`${message}\n`)
    return { stop() {} }
  }

  let frame = 0
  const interval = setInterval(() => {
    const symbol = pc.cyan(SPINNER_FRAMES[frame])
    process.stderr.write(`${ANSI_CURSOR_TO_START}${ANSI_CLEAR_LINE}${symbol} ${message}`)
    frame = (frame + 1) % SPINNER_FRAMES.length
  }, 80).unref()

  return {
    stop() {
      clearInterval(interval)
      process.stderr.write(`${ANSI_CURSOR_TO_START}${ANSI_CLEAR_LINE}`)
    },
  }
}

export function select(
  title: string,
  items: string[],
  options?: { doneLabels?: string[] },
): Promise<number> {
  return new Promise((resolve) => {
    let cursor = 0
    let filter = ''
    let filtered = items.map((_, i) => i)
    const write = (s: string) => process.stderr.write(s)

    function renderItem(fi: number) {
      const idx = filtered[fi] as number
      const item = items[idx] ?? ''
      const indicator = fi === cursor ? pc.cyan('>') : ' '
      const label = fi === cursor ? pc.cyan(item) : item
      return `${indicator} ${label}\n`
    }

    const hint = pc.dim('[Use arrows to move, type to filter]')
    let prevLines = 0

    function render() {
      if (prevLines > 0) write(`\x1b[${prevLines}A`)
      for (let i = 0; i < prevLines; i++) write(`\x1b[2K\n`)
      if (prevLines > 0) write(`\x1b[${prevLines}A`)

      const header = filter
        ? `${pc.green('?')} ${pc.bold(title)} ${pc.cyan(filter)}`
        : `${pc.green('?')} ${pc.bold(title)}   ${hint}`
      write(`\x1b[2K${header}\n`)
      for (let i = 0; i < filtered.length; i++) write(`\x1b[2K${renderItem(i)}`)
      prevLines = 1 + filtered.length
    }

    write('\x1b[?25l')
    prevLines = 0
    render()

    process.stdin.setRawMode(true)
    process.stdin.resume()

    function applyFilter() {
      const lower = filter.toLowerCase()
      filtered = items
        .map((item, i) => ({ item, i }))
        .filter(({ item }) => item.toLowerCase().includes(lower))
        .map(({ i }) => i)
      cursor = Math.min(cursor, Math.max(0, filtered.length - 1))
    }

    function onData(buf: Buffer) {
      const key = buf.toString()
      if (key === '\x1b[A') cursor = Math.max(0, cursor - 1)
      else if (key === '\x1b[B') cursor = Math.min(filtered.length - 1, cursor + 1)
      else if (key === '\r' || key === '\n') {
        if (filtered.length > 0) return done(filtered[cursor] as number)
      } else if (key === '\x03' || key === '\x1b') return done(-1)
      else if (key === '\x7f' || key === '\b') {
        filter = filter.slice(0, -1)
        applyFilter()
      } else if (key.length === 1 && key >= ' ') {
        filter += key
        applyFilter()
      } else return
      render()
    }

    function done(index: number) {
      if (prevLines > 0) write(`\x1b[${prevLines}A`)
      for (let i = 0; i < prevLines; i++) write(`\x1b[2K\n`)
      if (prevLines > 0) write(`\x1b[${prevLines}A`)
      const selected = index >= 0 ? (options?.doneLabels?.[index] ?? items[index] ?? '') : ''
      write(`\x1b[2K${pc.green('?')} ${pc.bold(title)} ${pc.cyan(selected)}\n`)
      write('\x1b[?25h')
      process.stdin.off('data', onData)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      resolve(index)
    }

    process.stdin.on('data', onData)
  })
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

// eslint-disable-next-line no-control-regex
const ansiRegex = /\x1b\[[0-9;]*m/

function truncateAnsi(str: string, maxVisible: number): string {
  let result = ''
  let visible = 0
  let i = 0
  while (i < str.length && visible < maxVisible) {
    const match = str.slice(i).match(ansiRegex)
    if (match?.index === 0) {
      result += match[0]
      i += match[0].length
    } else {
      result += str[i]
      visible++
      i++
    }
  }
  // Append any remaining ANSI reset sequences
  while (i < str.length) {
    const match = str.slice(i).match(ansiRegex)
    if (match?.index === 0) {
      result += match[0]
      i += match[0].length
    } else break
  }
  return result
}
