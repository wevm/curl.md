import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { resolve } from '../resolve.ts'
import * as rules from './index.ts'
import { mdn } from './mdn.ts'

test.each([
  'https://developer.mozilla.org/en-US/docs/Web/CSS/color',
  'https://developer.mozilla.org/ja/docs/Web/API/Fetch_API',
  'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript',
  'https://developer.mozilla.org/fr/docs/Web/HTML',
  'https://developer.mozilla.org/pt-BR/docs/Learn_web_development',
])('matches %s', (url) => {
  expect(resolve(url, rules).rule).toBe(mdn)
})

test.each([
  'https://developer.mozilla.org/en-US/',
  'https://developer.mozilla.org/en-US/blog/something',
  'https://developer.mozilla.org/en-US/search',
  'https://developer.mozilla.org/',
  'https://developer.mozilla.org/en-US/docs/',
])('does not match %s', (url) => {
  expect(resolve(url, rules).rule).toBeUndefined()
})

test('resolves en-US docs to content repo', () => {
  const result = resolve(
    'https://developer.mozilla.org/en-US/docs/Web/CSS/color',
    rules,
  )
  expect(result.url.href).toBe(
    'https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/css/color/index.md',
  )
})

test('resolves translated docs to translated-content repo', () => {
  const result = resolve(
    'https://developer.mozilla.org/ja/docs/Web/CSS/color',
    rules,
  )
  expect(result.url.href).toBe(
    'https://raw.githubusercontent.com/mdn/translated-content/main/files/ja/web/css/color/index.md',
  )
})

test('resolves zh-CN locale', () => {
  const result = resolve(
    'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript',
    rules,
  )
  expect(result.url.href).toBe(
    'https://raw.githubusercontent.com/mdn/translated-content/main/files/zh-cn/web/javascript/index.md',
  )
})

test('ignores non-docs paths', () => {
  const result = resolve(
    'https://developer.mozilla.org/en-US/blog/something',
    rules,
  )
  expect(result.rule).toBeUndefined()
})

test('ignores root path', () => {
  const result = resolve('https://developer.mozilla.org/en-US/', rules)
  expect(result.rule).toBeUndefined()
})

test('parses Array.prototype.map() fixture', async () => {
  const fixture = readFileSync(
    new URL('./__fixtures__/mdn-array-map.md', import.meta.url),
    'utf-8',
  )
  const result = await mdn.parse!(new Response(fixture))
  assert(result)
  expect(result.meta?.title).toBe('Array.prototype.map()')
  expect(result.content).not.toMatch(/\{\{/)
  expect(result.content).not.toMatch(/```\w+-nolint/)
  expect(result.content).not.toMatch(
    /```\w+\s+(?:example-good|example-bad|hidden|interactive-example)/,
  )
  await expect(result.content).toMatchFileSnapshot(
    './__snapshots__/mdn-array-map.md',
  )
})
