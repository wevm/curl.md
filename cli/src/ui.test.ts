import pc from 'picocolors'
import { expect, test, vi } from 'vitest'
import { callout, formatAbsoluteDate, formatDate, success, summary, table } from './ui.ts'

function strip(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

// table

const originalIsTTY = process.stdout.isTTY

test('table: basic alignment with 2-space gaps', () => {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true })
  const result = strip(
    table(
      ['Name', 'Age'],
      [
        ['Alice', '30'],
        ['Bob', '25'],
      ],
    ),
  )
  const lines = result.split('\n')
  expect(lines[0]).toBe('NAME   AGE')
  expect(lines[1]).toBe('Alice  30')
  expect(lines[2]).toBe('Bob    25')
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
})

test('table: varying column widths are padded correctly', () => {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true })
  const result = strip(
    table(
      ['ID', 'Description'],
      [
        ['1', 'Short'],
        ['1000', 'A longer description'],
      ],
    ),
  )
  const lines = result.split('\n')
  expect(lines[0]).toBe('ID    DESCRIPTION         ')
  expect(lines[1]).toBe('1     Short')
  expect(lines[2]).toBe('1000  A longer description')
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
})

test('table: ANSI-styled cells do not break alignment', () => {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true })
  const result = table(
    ['Key', 'Value'],
    [
      [pc.bold('styled'), 'plain'],
      ['normal', 'text'],
    ],
  )
  const stripped = strip(result)
  const lines = stripped.split('\n')
  // Both rows should have same column positions
  expect(lines[1]).toBe('styled  plain')
  expect(lines[2]).toBe('normal  text')
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
})

test('table: truncates columns to fit terminal width', () => {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true })
  const original = process.stdout.columns
  Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true })

  const result = strip(
    table(['Name', 'Description'], [['Alice', 'A very long description that should be truncated']]),
  )
  const lines = result.split('\n')
  for (const line of lines) expect(line.length).toBeLessThanOrEqual(40)
  expect(lines[1]).toContain('...')

  Object.defineProperty(process.stdout, 'columns', { value: original, writable: true })
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
})

test('table: truncation resets ANSI styles before ellipsis', () => {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true })
  const original = process.stdout.columns
  Object.defineProperty(process.stdout, 'columns', { value: 15, writable: true })

  const styled = `${pc.dim('a long styled cell value')}`
  const result = table(['col'], [[styled]])
  // "..." should not be inside the dim escape sequence
  const ellipsisIdx = result.indexOf('...')
  expect(ellipsisIdx).toBeGreaterThan(-1)
  const beforeEllipsis = result.slice(0, ellipsisIdx)
  expect(beforeEllipsis).toContain('\x1b[0m')

  Object.defineProperty(process.stdout, 'columns', { value: original, writable: true })
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
})

test('table: non-TTY outputs tab-separated values without headers', () => {
  const original = process.stdout.isTTY
  Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true })

  const result = table(
    ['Name', 'Age'],
    [
      ['Alice', '30'],
      ['Bob', '25'],
    ],
  )
  expect(result).toBe('Alice\t30\nBob\t25')

  Object.defineProperty(process.stdout, 'isTTY', { value: original, writable: true })
})

test('table: noTruncate prevents column from shrinking', () => {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true })
  const original = process.stdout.columns
  Object.defineProperty(process.stdout, 'columns', { value: 20, writable: true })

  const result = strip(
    table(['ID', 'Description'], [['ABC', 'A very long description']], { noTruncate: [0] }),
  )
  const lines = result.split('\n')
  expect(lines[1]).toContain('ABC')
  expect(lines[1]).toContain('...')

  Object.defineProperty(process.stdout, 'columns', { value: original, writable: true })
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
})

test('table: headers are uppercased', () => {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true })
  const result = strip(table(['name', 'age'], [['Alice', '30']]))
  const lines = result.split('\n')
  expect(lines[0]).toContain('NAME')
  expect(lines[0]).toContain('AGE')
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
})

// summary

test('summary: without title left-aligns bold labels with colon', () => {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true })
  const result = strip(
    summary([
      ['Name', 'Alice'],
      ['Age', '30'],
    ]),
  )
  const lines = result.split('\n')
  expect(lines[0]).toBe('Name:  Alice')
  expect(lines[1]).toBe('Age:   30')
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
})

test('summary: with title shows title then blank line then fields', () => {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true })
  const result = strip(summary([['Name', 'Alice']], 'Details'))
  const lines = result.split('\n')
  expect(lines[0]).toBe('Details')
  expect(lines[1]).toBe('')
  expect(lines[2]).toBe('Name:  Alice')
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
})

test('summary: labels of different lengths are left-aligned with padding after colon', () => {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true })
  const result = strip(
    summary([
      ['ID', '1'],
      ['Full Name', 'Alice'],
      ['Age', '30'],
    ]),
  )
  const lines = result.split('\n')
  expect(lines[0]).toBe('ID:         1')
  expect(lines[1]).toBe('Full Name:  Alice')
  expect(lines[2]).toBe('Age:        30')
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
})

test('summary: non-TTY outputs tab-delimited label:value without title', () => {
  Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true })
  const result = summary(
    [
      ['Name', 'Alice'],
      ['Age', '30'],
    ],
    'Details',
  )
  expect(result).toBe('Name:\tAlice\nAge:\t30')
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
})

// callout

test('callout: returns yellow prefix with message', () => {
  const originalIsTTY = process.stdout.isTTY
  Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true })
  const result = strip(callout('Warning!'))
  expect(result).toBe('> Warning!')
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
})

test('callout: returns empty string in non-TTY', () => {
  const originalIsTTY = process.stdout.isTTY
  Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true })
  expect(callout('Warning!')).toBe('')
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
})

// success

test('success: returns green checkmark with message', () => {
  const result = strip(success('Done.'))
  expect(result).toBe('✓ Done.')
})

// formatDate

test('formatDate: date less than 24h ago includes time', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-16T17:00:00Z'))

  const date = new Date('2026-03-16T14:30:00Z')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const abs = formatAbsoluteDate(date)
  const result = strip(formatDate(date))
  expect(result).toBe(`2h ago (${abs} ${hh}:${mm})`)

  vi.useRealTimers()
})

test('formatDate: date 24h or more ago omits time', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-16T17:00:00Z'))

  const date = new Date('2026-03-09T17:00:00Z')
  const abs = formatAbsoluteDate(date)
  const result = strip(formatDate(date))
  expect(result).toBe(`7d ago (${abs})`)

  vi.useRealTimers()
})

test('formatDate: returns "now" for very recent dates', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-16T17:00:00Z'))

  const date = new Date('2026-03-16T16:59:45Z')
  expect(formatDate(date)).toBe('now')

  vi.useRealTimers()
})
