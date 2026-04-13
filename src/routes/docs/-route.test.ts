import { expect, test } from 'vitest'
import { getThemeIconTheme } from './-theme.ts'

test('system theme stays on the neutral icon until mount completes', () => {
  expect(getThemeIconTheme('system', 'dark', false)).toBe('system')
  expect(getThemeIconTheme('system', 'light', false)).toBe('system')
})

test('system theme resolves to the active color scheme after mount', () => {
  expect(getThemeIconTheme('system', 'dark', true)).toBe('dark')
  expect(getThemeIconTheme('system', 'light', true)).toBe('light')
})

test('explicit themes do not depend on mount state', () => {
  expect(getThemeIconTheme('dark', 'light', false)).toBe('dark')
  expect(getThemeIconTheme('light', 'dark', false)).toBe('light')
})
