import { expect, test } from 'vitest'
import { defineRule } from './defineRule.ts'
import { resolve } from './resolve.ts'
import * as rules from './rules/index.ts'

test('resolves unknown hostname with no rule', () => {
  const result = resolve('https://unknown.example.com/page')
  expect(result.rule).toBeUndefined()
  expect(result.url.href).toBe('https://unknown.example.com/page')
  expect(result.source.href).toBe('https://unknown.example.com/page')
  expect(result.headers).toEqual({})
})

test('resolves with rules namespace', () => {
  const result = resolve('https://vitejs.dev/guide/getting-started', rules)
  expect(result.rule).toBeDefined()
  expect(result.url.pathname).toBe('/guide/getting-started.md')
  expect(result.source.pathname).toBe('/guide/getting-started')
})

test('accepts URL object', () => {
  const url = new URL('https://vitejs.dev/guide')
  const result = resolve(url, rules)
  expect(result.source).toBe(url)
  expect(result.url.pathname).toBe('/guide.md')
})

test('uses custom rule object', () => {
  const result = resolve('https://custom.example.com/docs/intro', [
    {
      patterns: ['custom.example.com'],
      resolve: (url) => {
        const resolved = new URL(url.href)
        resolved.pathname = `${url.pathname}.raw`
        return resolved
      },
    },
  ])
  expect(result.url.pathname).toBe('/docs/intro.raw')
})

test('uses defineRule shorthand', () => {
  const result = resolve('https://custom.example.com/docs/intro', [
    defineRule((url) => {
      const resolved = new URL(url.href)
      resolved.pathname = `${url.pathname}.txt`
      return resolved
    }),
  ])
  expect(result.url.pathname).toBe('/docs/intro.txt')
})

test('custom rule overrides', () => {
  const result = resolve('https://vitejs.dev/guide', [
    {
      patterns: ['vitejs.dev'],
      resolve: (url) => {
        const resolved = new URL(url.href)
        resolved.pathname = `/custom${url.pathname}`
        return resolved
      },
    },
  ])
  expect(result.url.pathname).toBe('/custom/guide')
})

test('rule resolve returning undefined falls back to source', () => {
  const result = resolve('https://custom.example.com/', [
    {
      patterns: ['custom.example.com'],
      resolve: () => undefined,
    },
  ])
  expect(result.url.href).toBe('https://custom.example.com/')
  expect(result.headers).toEqual({})
})

test('rule resolve returning headers', () => {
  const result = resolve('https://custom.example.com/page', [
    {
      patterns: ['custom.example.com'],
      resolve: (url) => ({
        url,
        headers: { Authorization: 'Bearer token' },
      }),
    },
  ])
  expect(result.headers).toEqual({ Authorization: 'Bearer token' })
})

test('rule with no resolve function', () => {
  const result = resolve('https://custom.example.com/page', [
    {
      patterns: ['custom.example.com'],
      parse: async () => ({ content: '' }),
    },
  ])
  expect(result.url.href).toBe('https://custom.example.com/page')
  expect(result.rule).toBeDefined()
})
