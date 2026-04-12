import type { Theme } from '#hooks/useTheme.ts'

export function getThemeIconTheme(
  theme: Theme,
  resolvedTheme: Exclude<Theme, 'system'>,
  mounted: boolean,
) {
  if (theme !== 'system') return theme
  if (mounted) return resolvedTheme

  return 'system'
}
