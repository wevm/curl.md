import { expect, test } from 'vitest'
import { create } from './mod.ts'
import * as profiles from './profiles.ts'

test('requests markdown directly for gitbook docs after profile detection', async () => {
  const body = 'Normalized docs body.'
  const requests: Array<{ accept: string | null; url: string }> = []
  const md = create({
    fetch: async (input, init) => {
      const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input
      const accept = init?.headers ? new Headers(init.headers).get('accept') : null
      requests.push({ accept, url })

      if (
        url === 'https://gitbook.com/docs/getting-started/quickstart' &&
        accept === 'text/markdown'
      )
        return new Response(withGitbookFooter(`# Quickstart\n\n${body}\n`), {
          headers: { 'content-type': 'text/markdown; charset=utf-8' },
          status: 200,
        })

      if (url === 'https://gitbook.com/docs/getting-started/quickstart')
        return new Response(
          '<!doctype html><html><head><meta name="generator" content="GitBook (0.0.0)"><link rel="alternate" type="text/markdown" href="https://gitbook.com/docs/getting-started/quickstart.md"></head><body><main class="page-has-toc"><h1>Quickstart</h1></main></body></html>',
          { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 200 },
        )

      return new Response(null, { status: 404 })
    },
    profiles,
  })

  const result = await md.fetch('https://gitbook.com/docs/getting-started/quickstart')
  expect(result.ok).toBe(true)
  if (!result.ok) return

  expect(requests).toEqual([
    { accept: null, url: 'https://gitbook.com/docs/getting-started/quickstart' },
    { accept: 'text/markdown', url: 'https://gitbook.com/docs/getting-started/quickstart' },
  ])
  expect(result.content).toContain(body)
  expect(result.content).not.toContain('Agent Instructions: Querying This Documentation')
  expect(result.content).not.toContain(
    'GET https://gitbook.com/docs/getting-started/quickstart.md?ask=<question>',
  )
  expect(result.meta.generator).toBe('GitBook (0.0.0)')
  expect(result.extras.source_tokens).toBeGreaterThan(0)
  expect(result.extras.source_tokens_method).toBe('html')
})

test('retries external vitepress docs with markdown when html extraction is too thin', async () => {
  const body = 'Normalized docs body.'
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
        return new Response(`# What is VitePress?\n\n${body}\n`, {
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
  expect(result.content).toContain(body)
  expect(result.meta.generator).toBe('VitePress v2.0.0-alpha.17')
  expect(result.extras.source_tokens).toBeGreaterThan(0)
  expect(result.extras.source_tokens_method).toBe('html')
})

test('requests markdown directly for mintlify docs after profile detection', async () => {
  const body = 'Normalized docs body.'
  const requests: Array<{ accept: string | null; url: string }> = []
  const md = create({
    fetch: async (input, init) => {
      const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input
      const accept = init?.headers ? new Headers(init.headers).get('accept') : null
      requests.push({ accept, url })

      if (url === 'https://mintlify.com/docs' && accept === 'text/markdown')
        return new Response(withMintlifyFooter(`# Mintlify docs\n\n${body}\n`), {
          headers: { 'content-type': 'text/markdown; charset=utf-8' },
          status: 200,
        })

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
  expect(result.content).toContain(body)
  expect(result.content).not.toContain('<AgentInstructions>')
  expect(result.content).not.toContain('Submitting Feedback')
  expect(result.content).not.toContain('Built with [Mintlify]')
  expect(result.meta.generator).toBe('Mintlify')
  expect(result.extras.source_tokens).toBeGreaterThan(0)
  expect(result.extras.source_tokens_method).toBe('html')
})

test('keeps html extraction when vitepress markdown path returns html', async () => {
  const body = 'HTML body survives.'
  const requests: string[] = []
  const md = create({
    fetch: async (input) => {
      const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input
      requests.push(url)

      if (url === 'https://vitepress.dev/guide/what-is-vitepress')
        return new Response(
          `<!doctype html><html><head><meta name="generator" content="VitePress"></head><body><main><h1>What is VitePress?</h1><p>${body}</p></main></body></html>`,
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
  expect(result.content).toContain(body)
  expect(result.extras.source_tokens_method).toBe('html')
})

function withGitbookFooter(content: string) {
  return `${content}\n---\n\n# Agent Instructions: Querying This Documentation\n\nIf you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.\n\nPerform an HTTP GET request on the current page URL with the \`ask\` query parameter:\n\n\`\`\`\nGET https://gitbook.com/docs/getting-started/quickstart.md?ask=<question>\n\`\`\`\n`
}

function withMintlifyFooter(content: string) {
  return `${content}\n<AgentInstructions>\n\n## Submitting Feedback\n\nPOST https://www.mintlify.com/docs/feedback\n\n</AgentInstructions>\n\nBuilt with [Mintlify](https://mintlify.com).\n`
}
