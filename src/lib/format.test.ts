import { expect, test } from 'vitest'
import { formatCost, formatDollars } from '#lib/format.ts'

test('formatCost returns 2 decimal places for costs >= $0.01', () => {
  expect(formatCost(1_000_000, 3)).toBe('3.00')
  expect(formatCost(500_000, 3)).toBe('1.50')
  expect(formatCost(10_000_000, 0.5)).toBe('5.00')
})

test('formatCost returns trimmed 4 decimal places for costs < $0.01', () => {
  expect(formatCost(1000, 3)).toBe('0.0030')
  expect(formatCost(100, 3)).toBe('0.0003')
  expect(formatCost(0, 3)).toBe('0.0')
})

test('formatDollars preserves sub-cent values when needed', () => {
  expect(formatDollars(0)).toBe('0.00')
  expect(formatDollars(0.003)).toBe('0.003')
  expect(formatDollars(0.0003)).toBe('0.0003')
  expect(formatDollars(1.5)).toBe('1.50')
})
