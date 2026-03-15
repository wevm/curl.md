import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { create } from '../mod.ts'
import { mdn } from './mdn.ts'

const fixture = readFileSync(
  path.resolve(import.meta.dirname, '__fixtures__/mdn-array-map.md'),
  'utf8',
)

// Rewrite tests

test('rewrites en-US docs URL to mdn/content repo', () => {
  const rule = mdn()
  const url = new URL(
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map',
  )
  const result = rule.rewrite!(url)!
  expect(result.href).toBe(
    'https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/javascript/reference/global_objects/array/map/index.md',
  )
})

test('rewrites non-English locale to mdn/translated-content repo', () => {
  const rule = mdn()
  const url = new URL(
    'https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/Array/map',
  )
  const result = rule.rewrite!(url)!
  expect(result.href).toBe(
    'https://raw.githubusercontent.com/mdn/translated-content/main/files/ja/web/javascript/reference/global_objects/array/map/index.md',
  )
})

test('lowercases slug in rewritten URL', () => {
  const rule = mdn()
  const url = new URL('https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement')
  const result = rule.rewrite!(url)!
  expect(result.pathname).toBe('/mdn/content/main/files/en-us/web/api/htmlelement/index.md')
})

// Integration test

test('extract produces expected output for Array.prototype.map', async () => {
  const md = create({
    rules: [mdn()],
    fetch: async () => new Response(fixture, { status: 200 }),
  })
  const result = await md.fetch(
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map',
  )
  expect(result.ok).toBe(true)
  if (!result.ok) return
  await expect(result.content).toMatchFileSnapshot('__snapshots__/mdn-array-map.md')
  expect(result.meta.title).toBe('Array.prototype.map()')
})

// Extract behavior tests

test('converts jsxref macros to inline code', async () => {
  const md = create({
    rules: [mdn()],
    fetch: async () =>
      new Response('---\ntitle: Test\n---\n\nSee {{jsxref("Array")}}.', {
        status: 200,
      }),
  })
  const result = await md.fetch('https://developer.mozilla.org/en-US/docs/Web/Test')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toContain('`Array`')
  expect(result.content).not.toContain('{{')
})

test('strips Specifications and Compat macros', async () => {
  const md = create({
    rules: [mdn()],
    fetch: async () =>
      new Response(
        '---\ntitle: Test\n---\n\nHello\n\n{{Specifications}}\n\n{{Compat}}\n\nGoodbye',
        { status: 200 },
      ),
  })
  const result = await md.fetch('https://developer.mozilla.org/en-US/docs/Web/Test')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).not.toContain('{{Specifications}}')
  expect(result.content).not.toContain('{{Compat}}')
  expect(result.content).toContain('Hello')
  expect(result.content).toContain('Goodbye')
})

test('converts optional_inline macro to _(optional)_', async () => {
  const md = create({
    rules: [mdn()],
    fetch: async () =>
      new Response('---\ntitle: Test\n---\n\n- `param` {{optional_inline}}', {
        status: 200,
      }),
  })
  const result = await md.fetch('https://developer.mozilla.org/en-US/docs/Web/Test')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toContain('_(optional)_')
  expect(result.content).not.toContain('{{optional_inline}}')
})

test('cleans code block info strings', async () => {
  const md = create({
    rules: [mdn()],
    fetch: async () =>
      new Response('---\ntitle: Test\n---\n\n```js-nolint\nconst x = 1\n```', {
        status: 200,
      }),
  })
  const result = await md.fetch('https://developer.mozilla.org/en-US/docs/Web/Test')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toContain('```js\n')
  expect(result.content).not.toContain('js-nolint')
})

test('strips InteractiveExample macros', async () => {
  const md = create({
    rules: [mdn()],
    fetch: async () =>
      new Response(
        '---\ntitle: Test\n---\n\n{{InteractiveExample("pages/js/array-map.html")}}\n\nContent here',
        { status: 200 },
      ),
  })
  const result = await md.fetch('https://developer.mozilla.org/en-US/docs/Web/Test')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).not.toContain('InteractiveExample')
  expect(result.content).toContain('Content here')
})
