import pc from 'picocolors'
import { relativeTime } from './utils.ts'

export function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, '')
}

export function wrapAnsiValue(value: string, width: number, indent: number) {
  const plain = stripAnsi(value)
  if (plain.length <= width || value.includes('\x1b[')) return value

  const lines: string[] = []
  let remaining = value
  while (remaining.length > width) {
    let breakIndex = remaining.lastIndexOf(' ', width)
    if (breakIndex <= 0) breakIndex = width
    lines.push(remaining.slice(0, breakIndex).trimEnd())
    remaining = remaining.slice(breakIndex).trimStart()
  }
  lines.push(remaining)
  return lines.join(`\n${' '.repeat(indent)}`)
}

export function table(
  headers: string[],
  rows: string[][],
  options?: { alignEnd?: number[]; noTruncate?: number[] },
): string {
  if (!process.stdout.isTTY) return rows.map((row) => row.map(stripAnsi).join('\t')).join('\n')

  const allRows = [headers, ...rows]
  const colWidths = headers.map((_, col) =>
    Math.max(...allRows.map((row) => stripAnsi(row[col] ?? '').length)),
  )
  const naturalWidths = [...colWidths]

  const minWidth = 4
  const gap = 2
  const termWidth = process.stdout.columns || 80
  const totalGaps = (headers.length - 1) * gap
  let availableWidth = termWidth - totalGaps

  const noTruncate = new Set(options?.noTruncate ?? [])
  const alignEnd = new Set(options?.alignEnd ?? [])
  const locked = new Set<number>()

  // Pass 1 — Lock noTruncate columns
  for (const col of noTruncate) {
    locked.add(col)
    availableWidth -= colWidths[col] ?? 0
  }

  // Pass 2 — Lock short columns at natural width
  let changed = true
  while (changed) {
    changed = false
    const flexCols = colWidths.map((_, i) => i).filter((i) => !locked.has(i))
    if (flexCols.length === 0) break
    const fairShare = availableWidth / flexCols.length
    for (const col of flexCols) {
      if ((colWidths[col] ?? 0) <= fairShare) {
        locked.add(col)
        availableWidth -= colWidths[col] ?? 0
        changed = true
      }
    }
  }

  // Pass 3 — Divide remaining equally among flex columns
  const flexCols = colWidths.map((_, i) => i).filter((i) => !locked.has(i))
  if (flexCols.length > 0) {
    const equalShare = Math.max(0, availableWidth / flexCols.length)
    for (const col of flexCols)
      colWidths[col] = Math.max(minWidth, Math.min(colWidths[col] ?? 0, Math.floor(equalShare)))
  }

  // Pass 4 — Redistribute surplus
  let surplus = availableWidth - flexCols.reduce((sum, col) => sum + (colWidths[col] ?? 0), 0)
  for (const col of flexCols) {
    const natural = naturalWidths[col] ?? 0
    const assigned = colWidths[col] ?? 0
    if (assigned < natural && surplus > 0) {
      const give = Math.min(surplus, natural - assigned)
      colWidths[col] = assigned + give
      surplus -= give
    }
  }

  // Pass 5 — Clamp total width to terminal
  let totalWidth = colWidths.reduce((a, b) => a + b, 0) + totalGaps
  // Shrink flex columns from right, then noTruncate columns from right
  const shrinkOrder = [...flexCols.reverse(), ...[...noTruncate].reverse()]
  for (const col of shrinkOrder) {
    if (totalWidth <= termWidth) break
    const over = totalWidth - termWidth
    const w = colWidths[col] ?? 0
    const shrink = Math.min(over, Math.max(0, w - minWidth))
    colWidths[col] = w - shrink
    totalWidth -= shrink
  }

  // Pass 6 — Collapse dim parentheticals and shrink columns
  // eslint-disable-next-line no-control-regex
  const dimParenRegex = / \x1b\[2m\(.*?\)\x1b\[22m$/
  for (let col = 0; col < headers.length; col++) {
    const maxW = colWidths[col] ?? 0
    let canShrink = true
    let effectiveMax = stripAnsi(headers[col] ?? '').length
    for (const row of rows) {
      const cell = row[col] ?? ''
      const visible = stripAnsi(cell).length
      if (visible <= maxW) {
        effectiveMax = Math.max(effectiveMax, visible)
        continue
      }
      const collapsed = cell.replace(dimParenRegex, '')
      const collapsedLen = stripAnsi(collapsed).length
      if (collapsedLen > maxW) {
        canShrink = false
        break
      }
      effectiveMax = Math.max(effectiveMax, collapsedLen)
    }
    if (canShrink) colWidths[col] = effectiveMax
  }

  const formatCell = (cell: string, i: number, isLast: boolean) => {
    const maxW = colWidths[i] ?? 0
    const visible = stripAnsi(cell)
    let fitted = cell
    if (visible.length > maxW) {
      // Try dropping dim parenthetical suffix before resorting to "..." truncation
      // eslint-disable-next-line no-control-regex
      const collapsed = cell.replace(/ \x1b\[2m\(.*?\)\x1b\[22m$/, '')
      if (stripAnsi(collapsed).length <= maxW) fitted = collapsed
      else fitted = truncateAnsi(cell, maxW - 3) + '\x1b[0m...'
    }
    const pad = maxW - stripAnsi(fitted).length
    const padding = ' '.repeat(Math.max(0, pad))
    if (alignEnd.has(i)) return `${padding}${fitted}`
    if (isLast) return fitted
    return fitted + padding
  }

  const headerLine = headers
    .map((h, i) => {
      const cell = formatCell(h.toUpperCase(), i, false)
      return pc.underline(pc.dim(cell))
    })
    .join('  ')

  const dataLines = rows.map((row) =>
    row.map((cell, i) => formatCell(cell, i, i === row.length - 1)).join('  '),
  )

  return [headerLine, ...dataLines].join('\n')
}

export function summary(fields: [string, string][], title?: string): string {
  if (!process.stdout.isTTY)
    return fields.map(([label, value]) => `${label}:\t${stripAnsi(value)}`).join('\n')

  const maxLabel = Math.max(...fields.map(([label]) => label.length))
  const lines = fields.map(
    ([label, value]) => `${pc.bold(`${label}:`)}${' '.repeat(maxLabel - label.length + 2)}${value}`,
  )
  if (!title) return lines.join('\n')
  return [title, '', ...lines].join('\n')
}

export function callout(message: string): string {
  if (!process.stdout.isTTY) return ''
  return `${pc.yellow('>')} ${message}`
}

export function success(message: string): string {
  return `${pc.green('✓')} ${message}`
}

export function warn(message: string): string {
  return `${pc.yellow('!')} ${message}`
}

export function error(message: string): string {
  return `${pc.red('X')} ${message}`
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

export function formatDateShort(date: Date): string {
  const rel = relativeTime(date)
  if (rel === 'now') return 'now'
  const diffMs = Date.now() - date.getTime()
  return diffMs >= 0 ? `${rel} ago` : `in ${rel}`
}

export function formatDate(date: Date): string {
  const rel = relativeTime(date)
  if (rel === 'now') return 'now'

  const abs = formatAbsoluteDate(date)

  const diffMs = Date.now() - date.getTime()
  const hours = Math.abs(diffMs) / (1000 * 60 * 60)
  const qualified = diffMs >= 0 ? `${rel} ago` : `in ${rel}`

  if (hours < 24) {
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return `${qualified} ${pc.dim(`(${abs} ${hh}:${mm})`)}`
  }

  return `${qualified} ${pc.dim(`(${abs})`)}`
}

const ANSI_CLEAR_LINE = '\x1B[2K'
const ANSI_CURSOR_TO_START = '\x1B[G'
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function createSpinner(message: string) {
  if (!process.stderr.isTTY) {
    if (message) process.stderr.write(`${message}\n`)
    return { stop() {} }
  }

  let frame = 0
  const suffix = message ? ` ${message}` : ''
  process.stderr.write('\x1b[?25l')
  const interval = setInterval(() => {
    const symbol = pc.cyan(SPINNER_FRAMES[frame])
    process.stderr.write(`${ANSI_CURSOR_TO_START}${ANSI_CLEAR_LINE}${symbol}${suffix}`)
    frame = (frame + 1) % SPINNER_FRAMES.length
  }, 80).unref()

  return {
    stop() {
      clearInterval(interval)
      process.stderr.write(`${ANSI_CURSOR_TO_START}${ANSI_CLEAR_LINE}\x1b[?25h`)
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
