import { expect, test } from 'vitest'
import { create } from './mod.ts'
import * as profiles from './profiles.ts'

test('retries external vitepress docs with markdown when html extraction is too thin', async () => {
  const requests: string[] = []
  const md = create({
    fetch: async (input) => {
      const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input
      requests.push(url)

      if (url === 'https://vitepress.dev/guide/what-is-vitepress')
        return new Response(
          '<!doctype html><html><head><meta name="generator" content="VitePress v2.0.0-alpha.17"></head><body><main><h1>What is VitePress?</h1></main></body></html>',
          { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 200 },
        )

      if (url === 'https://vitepress.dev/guide/what-is-vitepress.md')
        return new Response('# What is VitePress?\n\nVitePress docs body.\n', {
          headers: { 'content-type': 'text/markdown; charset=utf-8' },
          status: 200,
        })

      return new Response(null, { status: 404 })
    },
    profiles,
  })

  const result = await md.fetch('https://vitepress.dev/guide/what-is-vitepress')
  expect(result.ok).toBe(true)
  if (!result.ok) return

  expect(requests).toEqual([
    'https://vitepress.dev/guide/what-is-vitepress',
    'https://vitepress.dev/guide/what-is-vitepress.md',
  ])
  expect(result.content).toContain('VitePress docs body.')
  expect(result.meta.generator).toBe('VitePress v2.0.0-alpha.17')
  expect(result.extras.source_tokens_method).toBe('markdown')
})

test('requests markdown directly for mintlify docs after profile detection', async () => {
  const requests: Array<{ accept: string | null; url: string }> = []
  const md = create({
    fetch: async (input, init) => {
      const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input
      const accept = init?.headers ? new Headers(init.headers).get('accept') : null
      requests.push({ accept, url })

      if (url === 'https://mintlify.com/docs' && accept === 'text/markdown')
        return new Response(
          '# Mintlify docs\n\nMintlify docs body.\n\nBuilt with [Mintlify](https://mintlify.com).\n',
          {
            headers: { 'content-type': 'text/markdown; charset=utf-8' },
            status: 200,
          },
        )

      if (url === 'https://mintlify.com/docs')
        return new Response(
          '<!doctype html><html><head><meta name="generator" content="Mintlify"></head><body><main><h1>Mintlify docs</h1></main></body></html>',
          { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 200 },
        )

      return new Response(null, { status: 404 })
    },
    profiles,
  })

  const result = await md.fetch('https://mintlify.com/docs')
  expect(result.ok).toBe(true)
  if (!result.ok) return

  expect(requests).toEqual([
    { accept: null, url: 'https://mintlify.com/docs' },
    { accept: 'text/markdown', url: 'https://mintlify.com/docs' },
  ])
  expect(result.content).toContain('Mintlify docs body.')
  expect(result.content).not.toContain('Built with [Mintlify]')
  expect(result.meta.generator).toBe('Mintlify')
  expect(result.extras.source_tokens_method).toBe('markdown')
})

test('keeps html extraction when vitepress markdown path returns html', async () => {
  const requests: string[] = []
  const md = create({
    fetch: async (input) => {
      const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input
      requests.push(url)

      if (url === 'https://vitepress.dev/guide/what-is-vitepress')
        return new Response(
          '<!doctype html><html><head><meta name="generator" content="VitePress"></head><body><main><h1>What is VitePress?</h1><p>HTML body survives.</p></main></body></html>',
          { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 200 },
        )

      if (url === 'https://vitepress.dev/guide/what-is-vitepress.md')
        return new Response('<!doctype html><html><body>not markdown</body></html>', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
          status: 200,
        })

      return new Response(null, { status: 404 })
    },
    profiles,
  })

  const result = await md.fetch('https://vitepress.dev/guide/what-is-vitepress')
  expect(result.ok).toBe(true)
  if (!result.ok) return

  expect(requests).toEqual([
    'https://vitepress.dev/guide/what-is-vitepress',
    'https://vitepress.dev/guide/what-is-vitepress.md',
  ])
  expect(result.content).toContain('HTML body survives.')
  expect(result.extras.source_tokens_method).toBe('html')
})
