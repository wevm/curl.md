import { expect, test } from 'vitest'
import { create } from '../mod.ts'
import { githubDocs } from './github-docs.ts'

test('githubDocs rewrites to API with /en prefix', () => {
  const rule = githubDocs()
  const result = rule.rewrite?.(
    new URL('https://docs.github.com/actions/overview'),
  )
  expect(result?.pathname).toBe('/api/article')
  expect(result?.searchParams.get('pathname')).toBe('/en/actions/overview')
})

test('githubDocs preserves existing locale prefix', () => {
  const rule = githubDocs()
  const result = rule.rewrite?.(
    new URL('https://docs.github.com/ja/actions/overview'),
  )
  expect(result?.searchParams.get('pathname')).toBe('/ja/actions/overview')
})

test('githubDocs preserves all supported locales', () => {
  const rule = githubDocs()
  for (const locale of [
    'cn',
    'de',
    'en',
    'es',
    'fr',
    'ja',
    'ko',
    'pt',
    'ru',
    'zh',
  ]) {
    const result = rule.rewrite?.(
      new URL(`https://docs.github.com/${locale}/some/page`),
    )
    expect(result?.searchParams.get('pathname')).toBe(`/${locale}/some/page`)
  }
})

test('githubDocs extracts body and meta', async () => {
  const md = create({
    rules: [githubDocs()],
    fetch: async () =>
      new Response(
        JSON.stringify({
          body: '# Getting Started\n\nWelcome to GitHub.',
          meta: { title: 'Getting Started', intro: 'Learn how to use GitHub' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  })
  const result = await md.fetch('https://docs.github.com/actions/overview')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toBe('# Getting Started\n\nWelcome to GitHub.')
  expect(result.meta.title).toBe('Getting Started')
  expect(result.meta.description).toBe('Learn how to use GitHub')
})

test('githubDocs handles missing body', async () => {
  const md = create({
    rules: [githubDocs()],
    fetch: async () =>
      new Response(
        JSON.stringify({
          meta: { title: 'Empty' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  })
  const result = await md.fetch('https://docs.github.com/actions/overview')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toBe('{"meta":{"title":"Empty"}}')
})

test('githubDocs handles missing meta', async () => {
  const md = create({
    rules: [githubDocs()],
    fetch: async () =>
      new Response(
        JSON.stringify({
          body: 'Just content',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  })
  const result = await md.fetch('https://docs.github.com/actions/overview')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toBe('Just content')
})
