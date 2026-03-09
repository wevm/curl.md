import { expect, test } from 'vitest'
import { create } from '../mod.ts'
import { githubBlob, githubIssue, githubPr } from './github.ts'

test('githubBlob rewrites .md blob URL', () => {
  const rule = githubBlob()
  const result = rule.rewrite?.(
    new URL('https://github.com/owner/repo/blob/main/docs/README.md'),
  )
  expect(result?.href).toBe(
    'https://raw.githubusercontent.com/owner/repo/main/docs/README.md',
  )
})

test('githubBlob ignores non-md files', () => {
  const rule = githubBlob()
  const result = rule.rewrite?.(
    new URL('https://github.com/owner/repo/blob/main/src/index.ts'),
  )
  expect(result).toBeUndefined()
})

test('githubBlob rewrites .mdx blob URL', () => {
  const rule = githubBlob()
  const result = rule.rewrite?.(
    new URL('https://github.com/owner/repo/blob/main/docs/page.mdx'),
  )
  expect(result?.href).toBe(
    'https://raw.githubusercontent.com/owner/repo/main/docs/page.mdx',
  )
})

test('githubIssue rewrites to API URL', () => {
  const rule = githubIssue()
  const result = rule.rewrite?.(
    new URL('https://github.com/wevm/viem/issues/123'),
  )
  expect(result?.href).toBe('https://api.github.com/repos/wevm/viem/issues/123')
})

test('githubIssue extracts from REST API response', async () => {
  const md = create({
    rules: [githubIssue()],
    fetch: async () =>
      new Response(
        JSON.stringify({
          title: 'Bug report',
          body: 'Something is broken',
          state: 'open',
          user: { login: 'alice' },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
  })
  const result = await md.fetch('https://github.com/wevm/viem/issues/123')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toBe('Something is broken')
  expect(result.meta.title).toBe('Bug report')
  expect(result.meta.author).toBe('alice')
  expect(result.meta.state).toBe('open')
})

test('githubPr rewrites to API URL', () => {
  const rule = githubPr()
  const result = rule.rewrite?.(
    new URL('https://github.com/wevm/viem/pull/456'),
  )
  expect(result?.href).toBe('https://api.github.com/repos/wevm/viem/pulls/456')
})

test('githubPr extracts from REST API response', async () => {
  const md = create({
    rules: [githubPr()],
    fetch: async () =>
      new Response(
        JSON.stringify({
          title: 'Add feature',
          body: 'This PR adds a feature',
          state: 'closed',
          merged: true,
          user: { login: 'bob' },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
  })
  const result = await md.fetch('https://github.com/wevm/viem/pull/456')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toBe('This PR adds a feature')
  expect(result.meta.title).toBe('Add feature')
  expect(result.meta.author).toBe('bob')
  expect(result.meta.state).toBe('merged')
})

test('githubPr closed but not merged', async () => {
  const md = create({
    rules: [githubPr()],
    fetch: async () =>
      new Response(
        JSON.stringify({
          title: 'Rejected PR',
          body: 'This was rejected',
          state: 'closed',
          merged: false,
          user: { login: 'charlie' },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
  })
  const result = await md.fetch('https://github.com/wevm/viem/pull/789')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.meta.state).toBe('closed')
})

test('githubBlob pattern matches blob URLs', () => {
  const rule = githubBlob()
  const pattern = rule.patterns[0] as RegExp
  expect(pattern.test('https://github.com/owner/repo/blob/main/file.md')).toBe(
    true,
  )
  expect(pattern.test('https://github.com/owner/repo/issues/1')).toBe(false)
})

test('githubIssue pattern matches issue URLs', () => {
  const rule = githubIssue()
  const pattern = rule.patterns[0] as RegExp
  expect(pattern.test('https://github.com/owner/repo/issues/123')).toBe(true)
  expect(
    pattern.test('https://github.com/owner/repo/issues/123/comments'),
  ).toBe(false)
})

test('githubPr pattern matches PR URLs', () => {
  const rule = githubPr()
  const pattern = rule.patterns[0] as RegExp
  expect(pattern.test('https://github.com/owner/repo/pull/456')).toBe(true)
  expect(pattern.test('https://github.com/owner/repo/pull/456/files')).toBe(
    false,
  )
})
