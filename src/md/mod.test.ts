import { expect, test } from 'vitest'
import { create } from './mod.ts'
import * as profiles from './profiles.ts'

test('requests markdown directly for exdoc docs after profile detection', async () => {
  const body = 'Normalized docs body.'
  const requests: Array<{ accept: string | null; url: string }> = []
  const md = create({
    fetch: async (input, init) => {
      const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input
      const accept = init?.headers ? new Headers(init.headers).get('accept') : null
      requests.push({ accept, url })

      if (url === 'https://hexdocs.pm/boombox/readme.html' && accept === 'text/markdown')
        return new Response(`# README\n\n${body}\n`, {
          headers: { 'content-type': 'text/markdown; charset=utf-8' },
          status: 200,
        })

      if (url === 'https://hexdocs.pm/boombox/readme.html')
        return new Response(
          '<!doctype html><html><head><meta name="generator" content="ExDoc v0.40.1"></head><body><nav><ul id="sidebar-list-nav"></ul></nav><main class="content" id="main"><div id="content" class="content-inner"><a href="readme.md" class="copy-markdown icon-action">Copy Markdown</a><h1>README</h1><p>HTML fallback body.</p></div></main><footer><a href="llms.txt">View llms.txt</a></footer></body></html>',
          { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 200 },
        )

      return new Response(null, { status: 404 })
    },
    profiles,
  })

  const result = await md.fetch('https://hexdocs.pm/boombox/readme.html')
  expect(result.ok).toBe(true)
  if (!result.ok) return

  expect(requests).toEqual([
    { accept: null, url: 'https://hexdocs.pm/boombox/readme.html' },
    { accept: 'text/markdown', url: 'https://hexdocs.pm/boombox/readme.html' },
  ])
  expect(result.content).toContain(body)
  expect(result.content).not.toContain('HTML fallback body.')
  expect(result.meta.generator).toBe('ExDoc v0.40.1')
  expect(result.extras.source_tokens).toBeGreaterThan(0)
  expect(result.extras.source_tokens_method).toBe('html')
})

test('requests markdown directly for gitbook docs after profile detection', async () => {
  const body = 'Normalized docs body.'
  const requests: Array<{ accept: string | null; url: string }> = []
  const md = create({
    fetch: async (input, init) => {
      const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input
      const accept = init?.headers ? new Headers(init.headers).get('accept') : null
      requests.push({ accept, url })

      if (url === 'https://gitbook.com/docs/getting-started/quickstart.md')
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
    { accept: null, url: 'https://gitbook.com/docs/getting-started/quickstart.md' },
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

test('requests markdown directly for rspress docs after profile detection', async () => {
  const body = 'Normalized docs body.'
  const requests: Array<{ accept: string | null; url: string }> = []
  const md = create({
    fetch: async (input, init) => {
      const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input
      const accept = init?.headers ? new Headers(init.headers).get('accept') : null
      requests.push({ accept, url })

      if (url === 'https://rspress.rs/guide/start/introduction' && accept === 'text/markdown')
        return new Response(`# Introduction\n\n${body}\n`, {
          headers: { 'content-type': 'text/markdown; charset=utf-8' },
          status: 200,
        })

      if (url === 'https://rspress.rs/guide/start/introduction')
        return new Response(
          '<!doctype html><html><head><meta name="generator" content="Rspress v2.0.10"></head><body><div id="__rspress_root"><main class="rp-doc-layout__doc-container"><div class="rp-doc rspress-doc"><div class="rp-llms-button">Copy Markdown</div><h1>Introduction</h1><p>HTML fallback body.</p></div></main></div><div id="__rspress_modal_container"></div></body></html>',
          { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 200 },
        )

      return new Response(null, { status: 404 })
    },
    profiles,
  })

  const result = await md.fetch('https://rspress.rs/guide/start/introduction')
  expect(result.ok).toBe(true)
  if (!result.ok) return

  expect(requests).toEqual([
    { accept: null, url: 'https://rspress.rs/guide/start/introduction' },
    { accept: 'text/markdown', url: 'https://rspress.rs/guide/start/introduction' },
  ])
  expect(result.content).toContain(body)
  expect(result.content).not.toContain('HTML fallback body.')
  expect(result.meta.generator).toBe('Rspress v2.0.10')
  expect(result.extras.source_tokens).toBeGreaterThan(0)
  expect(result.extras.source_tokens_method).toBe('html')
})

test('fetches markdown from a text/markdown alternate link before converting html', async () => {
  const requests: string[] = []
  const md = create({
    fetch: async (input) => {
      const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input
      requests.push(url)

      if (url === 'https://example.com/docs/page')
        return new Response(
          '<!doctype html><html><head><link rel="alternate" type="text/markdown" href="/docs/page.md"></head><body><main><h1>HTML heading</h1><p>HTML body</p></main></body></html>',
          { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 200 },
        )

      if (url === 'https://example.com/docs/page.md')
        return new Response('# Markdown heading\n\nMarkdown body\n', {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
          status: 200,
        })

      return new Response(null, { status: 404 })
    },
    profiles,
  })

  const result = await md.fetch('https://example.com/docs/page')
  expect(result.ok).toBe(true)
  if (!result.ok) return

  expect(requests).toEqual(['https://example.com/docs/page', 'https://example.com/docs/page.md'])
  expect(result.content).toContain('Markdown body')
  expect(result.content).not.toContain('HTML body')
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
