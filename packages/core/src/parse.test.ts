import { describe, expect, test } from 'vitest'
import { parse } from './parse.ts'

describe('parse', () => {
  test('parses HTML response', async () => {
    const html =
      '<!doctype html><html><head><title>Test</title></head><body><p>Hello</p></body></html>'
    const res = new Response(html, {
      headers: { 'content-type': 'text/html' },
    })
    const result = await parse(res)
    expect(result.content).toContain('Hello')
    expect(result.content).not.toContain('---')
    expect(result.meta.title).toBe('Test')
  })

  test('parses markdown response without frontmatter', async () => {
    const res = new Response('# Hello\n\nWorld', {
      headers: { 'content-type': 'text/markdown' },
    })
    const result = await parse(res)
    expect(result.content).toBe('# Hello\n\nWorld')
    expect(result.meta).toEqual({})
  })

  test('extracts frontmatter from markdown response', async () => {
    const md =
      '---\ntitle: My Page\ndescription: A description\n---\n\n# Hello\n\nWorld'
    const res = new Response(md, {
      headers: { 'content-type': 'text/markdown' },
    })
    const result = await parse(res)
    expect(result.content).toBe('# Hello\n\nWorld')
    expect(result.meta.title).toBe('My Page')
    expect(result.meta.description).toBe('A description')
  })

  test('filters frontmatter to allowed keys', async () => {
    const md =
      '---\ntitle: Page\ndraft: true\nsidebar_position: 3\n---\n\nContent'
    const res = new Response(md, {
      headers: { 'content-type': 'text/markdown' },
    })
    const result = await parse(res)
    expect(result.meta.title).toBe('Page')
    expect(result.meta).not.toHaveProperty('draft')
    expect(result.meta).not.toHaveProperty('sidebar_position')
  })

  test('strips quoted frontmatter values', async () => {
    const md =
      '---\ntitle: "Quoted Title"\ndescription: \'Single Quoted\'\n---\n\nContent'
    const res = new Response(md, {
      headers: { 'content-type': 'text/markdown' },
    })
    const result = await parse(res)
    expect(result.meta.title).toBe('Quoted Title')
    expect(result.meta.description).toBe('Single Quoted')
  })

  test('derives site from sourceUrl', async () => {
    const res = new Response('Hello', {
      headers: { 'content-type': 'text/markdown' },
    })
    const result = await parse(res, {
      sourceUrl: new URL('https://example.com/page'),
    })
    expect(result.meta.site).toBe('example.com')
    expect(result.meta.url).toBe('https://example.com/page')
  })

  test('does not override existing site/url meta', async () => {
    const html =
      '<!doctype html><html><head><meta property="og:site_name" content="My Site"><link rel="canonical" href="https://canonical.com/page"></head><body><p>Hi</p></body></html>'
    const res = new Response(html, {
      headers: { 'content-type': 'text/html' },
    })
    const result = await parse(res, {
      sourceUrl: new URL('https://example.com/page'),
    })
    expect(result.meta.site).toBe('My Site')
    expect(result.meta.url).toBe('https://canonical.com/page')
  })

  test('derives site/url when not in HTML meta', async () => {
    const html =
      '<!doctype html><html><head><title>Test</title></head><body><p>Hi</p></body></html>'
    const res = new Response(html, {
      headers: { 'content-type': 'text/html' },
    })
    const result = await parse(res, {
      sourceUrl: new URL('https://example.com/docs/page'),
    })
    expect(result.meta.site).toBe('example.com')
    expect(result.meta.url).toBe('https://example.com/docs/page')
  })

  test('auto-detects HTML string', async () => {
    const result = await parse('<p>Hello</p>')
    expect(result.content).toContain('Hello')
    expect(result.from).toBe('html')
  })

  test('auto-detects HTML string with doctype', async () => {
    const result = await parse(
      '<!doctype html><html><head><title>Page</title></head><body><p>Hi</p></body></html>',
    )
    expect(result.content).toContain('Hi')
    expect(result.from).toBe('html')
    expect(result.meta.title).toBe('Page')
  })

  test('auto-detects markdown string', async () => {
    const result = await parse('# Hello\n\nWorld')
    expect(result.content).toBe('# Hello\n\nWorld')
    expect(result.from).toBe('markdown')
  })

  test('explicit as: md overrides auto-detection', async () => {
    const mdx = '<Component />\n\n# Hello'
    const result = await parse(mdx, { as: 'md' })
    expect(result.content).toBe('<Component />\n\n# Hello')
    expect(result.from).toBe('markdown')
  })

  test('explicit as: html overrides auto-detection', async () => {
    const result = await parse('# Not markdown', { as: 'html' })
    expect(result.from).toBe('html')
  })

  test('parses frontmatter from markdown string', async () => {
    const result = await parse('---\ntitle: My Page\n---\n\n# Hello\n\nWorld')
    expect(result.content).toBe('# Hello\n\nWorld')
    expect(result.meta.title).toBe('My Page')
    expect(result.from).toBe('markdown')
  })
})
