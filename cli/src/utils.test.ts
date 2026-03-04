import { expect, test } from 'vitest'
import { compareVersions, formatValidationError } from './utils.ts'

test('compareVersions: equal versions return 0', () => {
  expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
})

test('compareVersions: greater major returns positive', () => {
  expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0)
})

test('compareVersions: lesser major returns negative', () => {
  expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
})

test('compareVersions: greater minor returns positive', () => {
  expect(compareVersions('1.2.0', '1.1.0')).toBeGreaterThan(0)
})

test('compareVersions: greater patch returns positive', () => {
  expect(compareVersions('1.0.2', '1.0.1')).toBeGreaterThan(0)
})

test('compareVersions: strips v prefix', () => {
  expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
})

test('compareVersions: different length versions', () => {
  expect(compareVersions('1.0', '1.0.0')).toBe(0)
})

test('formatValidationError: formats single issue', () => {
  expect(
    formatValidationError({
      error: 'validation_error',
      issues: [{ path: 'login', message: 'Required' }],
    }),
  ).toBe('login: Required')
})

test('formatValidationError: formats multiple issues', () => {
  expect(
    formatValidationError({
      error: 'validation_error',
      issues: [
        { path: 'login', message: 'Too short' },
        { path: 'name', message: 'Required' },
      ],
    }),
  ).toBe('login: Too short\nname: Required')
})

test('formatValidationError: returns fallback for non-validation error', () => {
  expect(formatValidationError({ error: 'not_found' })).toBe('Invalid request')
  expect(formatValidationError({ error: 'not_found' }, 'custom')).toBe('custom')
})

test('formatValidationError: returns fallback for non-object', () => {
  expect(formatValidationError('string')).toBe('Invalid request')
  expect(formatValidationError(null)).toBe('Invalid request')
})
