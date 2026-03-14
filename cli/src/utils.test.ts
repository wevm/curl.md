import child_process from 'node:child_process'
import fs from 'node:fs'
import { expect, test, vi } from 'vitest'
import {
  compareVersions,
  formatValidationError,
  updateStandalone,
} from './utils.ts'

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

test('updateStandalone: uses direct fetch when response is ok', async () => {
  const binary = Buffer.from('fake-binary')
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(binary, { status: 200 }))
  const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
  const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {})
  const execSpy = vi.spyOn(child_process, 'execFileSync')

  await updateStandalone('1.0.0', [])

  expect(fetchSpy).toHaveBeenCalledOnce()
  expect(execSpy).not.toHaveBeenCalled()
  expect(writeSpy).toHaveBeenCalledOnce()

  fetchSpy.mockRestore()
  writeSpy.mockRestore()
  renameSpy.mockRestore()
  execSpy.mockRestore()
})

test('updateStandalone: falls back to gh CLI when fetch returns 404', async () => {
  const binary = Buffer.from('fake-binary')
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('Not Found', { status: 404 }))
  const execSpy = vi
    .spyOn(child_process, 'execFileSync')
    .mockImplementation(() => Buffer.alloc(0))
  const readSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(binary)
  const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {})
  const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
  const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {})

  await updateStandalone('1.0.0', [])

  expect(fetchSpy).toHaveBeenCalledOnce()
  expect(execSpy).toHaveBeenCalledOnce()
  expect(execSpy.mock.calls[0]![0]).toBe('gh')
  expect(execSpy.mock.calls[0]![1]).toContain('release')
  expect(execSpy.mock.calls[0]![1]).toContain('curl.md@1.0.0')
  expect(writeSpy).toHaveBeenCalledOnce()

  fetchSpy.mockRestore()
  execSpy.mockRestore()
  readSpy.mockRestore()
  unlinkSpy.mockRestore()
  writeSpy.mockRestore()
  renameSpy.mockRestore()
})

test('updateStandalone: throws when both fetch and gh CLI fail', async () => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('Not Found', { status: 404 }))
  const execSpy = vi
    .spyOn(child_process, 'execFileSync')
    .mockImplementation(() => {
      throw new Error('gh not found')
    })

  await expect(updateStandalone('1.0.0', [])).rejects.toThrow(
    'Download failed (404)',
  )

  fetchSpy.mockRestore()
  execSpy.mockRestore()
})
