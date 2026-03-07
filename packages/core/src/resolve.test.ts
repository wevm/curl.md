import { expect, test } from 'vitest'
import { resolve } from './resolve.ts'

test('resolves unknown hostname with no rule', () => {
  const result = resolve('https://unknown.example.com/page')
  expect(result.rule).toBeUndefined()
  expect(result.url.href).toBe('https://unknown.example.com/page')
  expect(result.source.href).toBe('https://unknown.example.com/page')
  expect(result.headers).toEqual({})
})

test('resolves builtin rule', () => {
  const result = resolve('https://vitejs.dev/guide/getting-started')
  expect(result.rule).toBeDefined()
  expect(result.url.pathname).toBe('/guide/getting-started.md')
  expect(result.source.pathname).toBe('/guide/getting-started')
})

test('accepts URL object', () => {
  const url = new URL('https://vitejs.dev/guide')
  const result = resolve(url)
  expect(result.source).toBe(url)
  expect(result.url.pathname).toBe('/guide.md')
})

test('uses custom rule object', () => {
  const result = resolve('https://custom.example.com/docs/intro', {
    rules: {
      'custom.example.com': {
        resolve: (url) => {
          const resolved = new URL(url.href)
          resolved.pathname = `${url.pathname}.raw`
          return resolved
        },
      },
    },
  })
  expect(result.url.pathname).toBe('/docs/intro.raw')
})

test('uses custom rule function', () => {
  const result = resolve('https://custom.example.com/docs/intro', {
    rules: {
      'custom.example.com': (url) => {
        const resolved = new URL(url.href)
        resolved.pathname = `${url.pathname}.txt`
        return resolved
      },
    },
  })
  expect(result.url.pathname).toBe('/docs/intro.txt')
})

test('custom rule overrides builtin', () => {
  const result = resolve('https://vitejs.dev/guide', {
    rules: {
      'vitejs.dev': {
        resolve: (url) => {
          const resolved = new URL(url.href)
          resolved.pathname = `/custom${url.pathname}`
          return resolved
        },
      },
    },
  })
  expect(result.url.pathname).toBe('/custom/guide')
})

test('rule resolve returning undefined falls back to source', () => {
  const result = resolve('https://custom.example.com/', {
    rules: {
      'custom.example.com': {
        resolve: () => undefined,
      },
    },
  })
  expect(result.url.href).toBe('https://custom.example.com/')
  expect(result.headers).toEqual({})
})

test('rule resolve returning headers', () => {
  const result = resolve('https://custom.example.com/page', {
    rules: {
      'custom.example.com': {
        resolve: (url) => ({
          url,
          headers: { Authorization: 'Bearer token' },
        }),
      },
    },
  })
  expect(result.headers).toEqual({ Authorization: 'Bearer token' })
})

test('rule with no resolve function', () => {
  const result = resolve('https://custom.example.com/page', {
    rules: {
      'custom.example.com': {
        parse: async () => ({ markdown: '' }),
      },
    },
  })
  expect(result.url.href).toBe('https://custom.example.com/page')
  expect(result.rule).toBeDefined()
})
