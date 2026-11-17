import { expect } from '@playwright/test'
import { test } from '#test/e2e.utils.ts'

test('/api/health passes through to the API handler', async ({ request }) => {
  const res = await request.get('/api/health')

  expect(res.status()).toBe(200)
  await expect(res.json()).resolves.toEqual({ ok: true })
})

test('/docs serves markdown when Accept requests markdown', async ({ request }) => {
  const markdownRes = await request.get('/docs/guide/cli', {
    headers: { Accept: 'text/markdown' },
  })
  const canonicalMarkdownRes = await request.get('/docs/guide/cli.md')

  expect(markdownRes.status()).toBe(200)
  expect(markdownRes.headers()['content-type']).toContain('text/markdown')
  expect(markdownRes.headers()['vary']).toContain('Accept')
  expect(canonicalMarkdownRes.status()).toBe(200)
  expect(canonicalMarkdownRes.headers()['content-type']).toContain('text/markdown')
  await expect(markdownRes.text()).resolves.toBe(await canonicalMarkdownRes.text())
})

test('/docs serves html when Accept requests html', async ({ request }) => {
  const res = await request.get('/docs/guide/cli', {
    headers: { Accept: 'text/html' },
  })

  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/html')
  expect(res.headers()['vary']).toContain('Accept')
  await expect(res.text()).resolves.toContain('<!DOCTYPE html>')
})

test('/docs honors q-values when markdown is preferred over html', async ({ request }) => {
  const res = await request.get('/docs/guide/cli', {
    headers: { Accept: 'text/html;q=0.1, text/markdown;q=0.9' },
  })

  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/markdown')
  expect(res.headers()['vary']).toContain('Accept')
})

test('/docs returns 406 when Accept excludes html and markdown', async ({ request }) => {
  const res = await request.get('/docs/guide/cli', {
    headers: { Accept: 'application/json' },
  })

  expect(res.status()).toBe(406)
  expect(res.headers()['vary']).toContain('Accept')
  await expect(res.text()).resolves.toBe('Not Acceptable')
})

test('/docs redirects mixed-case paths to lowercase canonical paths', async ({ request }) => {
  const res = await request.get('/docs/INSTALL?tab=pnpm', {
    maxRedirects: 0,
  })

  expect(res.status()).toBe(301)
  expect(res.headers().location).toBe('/docs/install?tab=pnpm')
})

test('mixed-case non-docs paths are not lowercased', async ({ request }) => {
  const res = await request.get('/invite/AbC123', {
    maxRedirects: 0,
  })

  expect(res.status()).not.toBe(301)
  await expect(res.text()).resolves.toContain('Invalid Invite')
})

test('dot-segment paths rewrite to the API handler', async ({ request }) => {
  const rewrittenRes = await request.get('/curl.local/docs/guide/cli', {
    headers: { Accept: 'text/markdown' },
  })

  expect(rewrittenRes.status()).toBe(200)
  expect(rewrittenRes.headers()['content-type']).toContain('text/markdown')
  expect(rewrittenRes.headers()['vary']).toContain('Accept')
  await expect(rewrittenRes.text()).resolves.toContain('url: https://curl.local/docs/guide/cli')
  await expect(rewrittenRes.text()).resolves.toContain('site: curl.local')
  await expect(rewrittenRes.text()).resolves.toContain('# CLI')
})

test('browser navigation to dot-segment paths renders converted external markdown', async ({
  page,
}) => {
  await page.goto('/example.com')

  await expect(page.locator('body')).toContainText('title: Example Domain')
  await expect(page.locator('body')).toContainText('url: https://example.com/')
  await expect(page.locator('body')).toContainText('site: example.com')
})

test('protocol-prefixed browser paths redirect to non-protocol paths', async ({ request }) => {
  const res = await request.get('/https://curl.local/docs/guide/cli?tab=pnpm', {
    headers: { Accept: 'text/html' },
    maxRedirects: 0,
  })

  expect(res.status()).toBe(301)
  expect(res.headers().location).toBe('/curl.local/docs/guide/cli?tab=pnpm')
})

test('protocol-prefixed non-html paths rewrite to the API handler', async ({ request }) => {
  const rewrittenRes = await request.get('/https://curl.local/docs/guide/cli', {
    headers: { Accept: 'text/markdown' },
  })

  expect(rewrittenRes.status()).toBe(200)
  expect(rewrittenRes.headers()['content-type']).toContain('text/markdown')
  expect(rewrittenRes.headers()['vary']).toContain('Accept')
  await expect(rewrittenRes.text()).resolves.toContain('url: https://curl.local/docs/guide/cli')
  await expect(rewrittenRes.text()).resolves.toContain('site: curl.local')
  await expect(rewrittenRes.text()).resolves.toContain('# CLI')
})

test('/skills serves the skills index asset', async ({ request }) => {
  const res = await request.get('/skills')

  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('application/json')
  await expect(res.json()).resolves.toEqual({
    skills: [
      expect.objectContaining({
        files: ['SKILL.md'],
        name: 'curl-md',
      }),
    ],
  })
})

test('/.well-known/skills/curl-md serves the skill markdown asset', async ({ request }) => {
  const res = await request.get('/.well-known/skills/curl-md')

  expect(res.status()).toBe(200)
  await expect(res.text()).resolves.toContain('# curl.md')
})

test('invalid encoded paths return 400', async ({ request }) => {
  const res = await request.get('/%E0%A4%A', { failOnStatusCode: false })

  expect(res.status()).toBe(400)
  await expect(res.text()).resolves.toBe('Bad Request')
})
