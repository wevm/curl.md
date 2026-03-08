import assert from 'node:assert/strict'
import { expect, test } from 'vitest'
import { resolve } from '../resolve.ts'
import { githubDocs } from './github-docs.ts'
import * as rules from './index.ts'

test.each([
  'https://docs.github.com/en/actions',
  'https://docs.github.com/en/rest/overview',
  'https://docs.github.com/ja/actions',
  'https://docs.github.com/actions',
])('matches %s', (url) => {
  expect(resolve(url, rules).rule).toBe(githubDocs)
})

test('resolves to /api/article with /en prefix', () => {
  const result = resolve('https://docs.github.com/en/actions/overview', rules)
  expect(result.url.href).toBe(
    'https://docs.github.com/api/article?pathname=%2Fen%2Factions%2Foverview',
  )
})

test('prepends /en when no locale segment', () => {
  const result = resolve('https://docs.github.com/actions/overview', rules)
  expect(result.url.href).toBe(
    'https://docs.github.com/api/article?pathname=%2Fen%2Factions%2Foverview',
  )
})

test.each([
  'cn',
  'de',
  'es',
  'fr',
  'ja',
  'ko',
  'pt',
  'ru',
  'zh',
])('preserves %s locale prefix', (locale) => {
  const result = resolve(`https://docs.github.com/${locale}/actions`, rules)
  expect(result.url.searchParams.get('pathname')).toBe(`/${locale}/actions`)
})

test('parses article response', async () => {
  const json = {
    body: '# GitHub Actions\n\nAutomate your workflow.',
    meta: {
      title: 'GitHub Actions',
      intro: 'Automate, customize, and execute workflows.',
    },
  }
  const res = new Response(JSON.stringify(json))
  const result = await githubDocs.parse!(res)
  assert(result)
  expect(result.content).toBe('# GitHub Actions\n\nAutomate your workflow.')
  expect(result.meta?.title).toBe('GitHub Actions')
  expect(result.meta?.description).toBe(
    'Automate, customize, and execute workflows.',
  )
})

test('parses response without body', async () => {
  const json = { meta: { title: 'Test' } }
  const res = new Response(JSON.stringify(json))
  const result = await githubDocs.parse!(res)
  assert(result)
  expect(result.content).toBe(JSON.stringify({ meta: { title: 'Test' } }))
})

test('parses response without meta', async () => {
  const json = { body: 'Hello' }
  const res = new Response(JSON.stringify(json))
  const result = await githubDocs.parse!(res)
  assert(result)
  expect(result.content).toBe('Hello')
  expect(result.meta?.title).toBeUndefined()
  expect(result.meta?.description).toBeUndefined()
})
