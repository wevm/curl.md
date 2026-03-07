import { env, fetchMock } from 'cloudflare:test'
import { estimateTokenCount } from 'tokenx'
import { afterEach, expect, test, vi } from 'vitest'
import { fetchPage } from '#lib/fetch-page.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

test('self-host detection returns self-markdown with tokensSaved 0', async () => {
  const llmsTxt = '# curl.md\n\nFetch any URL as markdown.'
  vi.spyOn(env.ASSETS, 'fetch').mockResolvedValue(new Response(llmsTxt))

  const url = new URL(`https://${env.HOST}`)
  const result = await fetchPage(url)
  expect(result.tokensSaved).toBe(0)
  expect(result.markdown).toContain('curl.md')
  expect(result.tokensCount).toBe(estimateTokenCount(result.markdown))
})

test('converts html to markdown', async () => {
  const html = '<html><body><h1>Hello</h1><p>World</p></body></html>'

  fetchMock
    .get('https://html.example.com')
    .intercept({ path: '/' })
    .reply(200, html, { headers: { 'content-type': 'text/html' } })

  const result = await fetchPage(new URL('https://html.example.com/'))

  expect(result.markdown).toContain('# Hello')
  expect(result.markdown).toContain('World')
  expect(result.tokensCount).toBe(estimateTokenCount(result.markdown))
  const contentWithoutFrontmatter = result.markdown.replace(
    /^---\n[\s\S]*?\n---\n\n/,
    '',
  )
  expect(result.tokensSaved).toBe(
    estimateTokenCount(html) - estimateTokenCount(contentWithoutFrontmatter),
  )
})

test('throws on upstream error', async () => {
  fetchMock
    .get('https://error.example.com')
    .intercept({ path: '/' })
    .reply(500, 'Internal Server Error')

  await expect(
    fetchPage(new URL('https://error.example.com/')),
  ).rejects.toThrow('Upstream returned 500')
})

const sectionsHtml = `<html><body>
<h1>Docs</h1>
<h2>Authentication</h2><p>Auth content here</p>
<h2>Database</h2><p>DB content here</p>
<h2>Caching</h2><p>Cache content here</p>
</body></html>`

test('keyword filtering keeps only matching sections', async () => {
  fetchMock
    .get('https://filter.example.com')
    .intercept({ path: '/' })
    .reply(200, sectionsHtml, { headers: { 'content-type': 'text/html' } })

  const result = await fetchPage(new URL('https://filter.example.com/'), {
    keywords: ['auth'],
  })

  expect(result.markdown).toContain('Authentication')
  expect(result.markdown).not.toContain('Database')
  expect(result.markdown).not.toContain('Caching')
})

test('keyword filtering with no match keeps all content', async () => {
  fetchMock
    .get('https://nomatch.example.com')
    .intercept({ path: '/' })
    .reply(200, sectionsHtml, { headers: { 'content-type': 'text/html' } })

  const result = await fetchPage(new URL('https://nomatch.example.com/'), {
    keywords: ['nonexistent'],
  })

  expect(result.markdown).toContain('Authentication')
  expect(result.markdown).toContain('Database')
  expect(result.markdown).toContain('Caching')
})

test('keyword filtering is case insensitive', async () => {
  fetchMock
    .get('https://icase.example.com')
    .intercept({ path: '/' })
    .reply(200, sectionsHtml, { headers: { 'content-type': 'text/html' } })

  const result = await fetchPage(new URL('https://icase.example.com/'), {
    keywords: ['AUTH'],
  })

  expect(result.markdown).toContain('Authentication')
  expect(result.markdown).not.toContain('Database')
  expect(result.markdown).not.toContain('Caching')
})
