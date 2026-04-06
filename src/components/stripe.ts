import type { Appearance } from '@stripe/stripe-js'

export function stripeAppearance(theme: 'light' | 'dark'): Appearance {
  return {
    disableAnimations: true,
    theme: theme === 'dark' ? 'night' : 'stripe',
    variables: {
      borderRadius: '0px',
      colorBackground: color(theme, 'bga1'),
      colorDanger: color(theme, 'red9'),
      colorPrimary: color(theme, 'gray10'),
      colorSuccess: color(theme, 'green9'),
      colorText: color(theme, 'gray10'),
      colorTextSecondary: color(theme, 'gray8'),
      fontFamily: '"Geist Mono Variable", monospace',
      fontSizeBase: '14px',
    },
  }
}

// Mirrors light-dark() values from styles.css @theme
// lightningcss compiles light-dark() so getComputedStyle can't resolve them
const colors = {
  bg1: { light: 'hsl(0 0% 98%)', dark: 'hsl(0 0% 0%)' },
  bga1: { light: 'hsl(0 0% 97%)', dark: 'hsl(0 0% 3%)' },
  gray8: { light: 'hsl(0 0% 49%)', dark: 'hsl(0 0% 49%)' },
  gray10: { light: 'hsl(0 0% 9%)', dark: 'hsl(0 0% 93%)' },
  green9: { light: 'hsl(133 50% 32%)', dark: 'hsl(131 43% 57%)' },
  red9: { light: 'hsl(358 66% 48%)', dark: 'hsl(358 100% 69%)' },
} as const

function color(theme: 'light' | 'dark', name: keyof typeof colors) {
  return colors[name][theme]
}
