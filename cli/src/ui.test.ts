import pc from 'picocolors'
import { expect, test, vi } from 'vitest'
import { callout, formatDate, summary, table } from './ui.ts'

function strip(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

// table

test('table: basic alignment with 2-space indent and 3-space gaps', () => {
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
  expect(lines[0]).toBe('  Name    Age')
  expect(lines[1]).toBe('  Alice   30 ')
  expect(lines[2]).toBe('  Bob     25 ')
})

test('table: varying column widths are padded correctly', () => {
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
  expect(lines[0]).toBe('  ID     Description         ')
  expect(lines[1]).toBe('  1      Short               ')
  expect(lines[2]).toBe('  1000   A longer description')
})

test('table: ANSI-styled cells do not break alignment', () => {
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
  expect(lines[1]).toBe('  styled   plain')
  expect(lines[2]).toBe('  normal   text ')
})

// summary

test('summary: without title right-aligns labels', () => {
  const result = strip(
    summary([
      ['Name', 'Alice'],
      ['Age', '30'],
    ]),
  )
  const lines = result.split('\n')
  expect(lines[0]).toBe('  Name   Alice')
  expect(lines[1]).toBe('   Age   30')
})

test('summary: with title shows title then blank line then fields', () => {
  const result = strip(summary([['Name', 'Alice']], 'Details'))
  const lines = result.split('\n')
  expect(lines[0]).toBe('Details')
  expect(lines[1]).toBe('')
  expect(lines[2]).toBe('  Name   Alice')
})

test('summary: labels of different lengths are right-aligned', () => {
  const result = strip(
    summary([
      ['ID', '1'],
      ['Full Name', 'Alice'],
      ['Age', '30'],
    ]),
  )
  const lines = result.split('\n')
  expect(lines[0]).toBe('         ID   1')
  expect(lines[1]).toBe('  Full Name   Alice')
  expect(lines[2]).toBe('        Age   30')
})

// callout

test('callout: returns 2-space indented yellow message', () => {
  const result = strip(callout('Warning!'))
  expect(result).toBe('  Warning!')
})

// formatDate

test('formatDate: date less than 24h ago includes time', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-16T17:00:00Z'))

  const date = new Date('2026-03-16T14:30:00Z')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const result = strip(formatDate(date))
  expect(result).toBe(`2h (Mar 16 2026 ${hh}:${mm})`)

  vi.useRealTimers()
})

test('formatDate: date 24h or more ago omits time', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-16T17:00:00Z'))

  const date = new Date('2026-03-09T17:00:00Z')
  const result = strip(formatDate(date))
  expect(result).toMatch(/^7d \(Mar 9 2026\)$/)

  vi.useRealTimers()
})

test('formatDate: returns "now" for very recent dates', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-16T17:00:00Z'))

  const date = new Date('2026-03-16T16:59:45Z')
  expect(formatDate(date)).toBe('now')

  vi.useRealTimers()
})
