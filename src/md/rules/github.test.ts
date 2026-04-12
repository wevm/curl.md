import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { create } from '../mod.ts'
import { githubBlob, githubIssue, githubPr, githubRepo } from './github.ts'

const prFixture = readFileSync(
  path.resolve(import.meta.dirname, '__fixtures__/github-pr-66.html'),
  'utf8',
)

test('extract produces expected output for PR HTML', async () => {
  const md = create({
    rules: [githubPr()],
    fetch: async () => new Response(prFixture, { status: 200 }),
  })
  const result = await md.fetch('https://github.com/wevm/viem/pull/66')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  await expect(result.content).toMatchFileSnapshot('__snapshots__/github-pr-66.md')
})

test('extracts issue content from modern GitHub embedded data', async () => {
  const html = `<script type="application/json" data-target="react-app.embeddedData">${JSON.stringify(
    {
      payload: {
        preloadedQueries: [
          {
            result: {
              data: {
                repository: {
                  issue: {
                    author: { login: 'gumonteilh' },
                    body: 'Issue body',
                    createdAt: '2026-04-10T13:00:05Z',
                    frontTimelineItems: {
                      edges: [
                        {
                          node: {
                            __typename: 'IssueComment',
                            author: { login: 'github-actions' },
                            body: 'Auto-close comment',
                            createdAt: '2026-04-10T13:00:17Z',
                          },
                        },
                      ],
                    },
                    number: 3005,
                    state: 'OPEN',
                    title: 'Make "UPDATE AVAILABLE" message toggleable',
                    updatedAt: '2026-04-11T14:50:26Z',
                  },
                },
              },
            },
          },
        ],
      },
    },
  )}</script>`
  const md = create({
    rules: [githubIssue()],
    fetch: async () => new Response(html, { status: 200 }),
  })
  const result = await md.fetch('https://github.com/badlogic/pi-mono/issues/3005')

  expect(result.ok).toBe(true)
  if (!result.ok) return

  expect(result.content).toBe(
    'Issue body\n\n<comment author="github-actions" date="2026-04-10T13:00:17Z">\nAuto-close comment\n</comment>',
  )
  expect(result.meta).toEqual({
    author: 'gumonteilh',
    created_at: '2026-04-10T13:00:05Z',
    number: 3005,
    site: 'github.com',
    state: 'open',
    title: 'Make "UPDATE AVAILABLE" message toggleable',
    updated_at: '2026-04-11T14:50:26Z',
    url: 'https://github.com/badlogic/pi-mono/issues/3005',
  })
})

test('githubRepo rewrites to raw README.md', () => {
  const rule = githubRepo()
  const url = new URL('https://github.com/owner/repo')
  const pattern = rule.patterns[0]
  assert(pattern instanceof URLPattern)
  const match = pattern.exec(url)
  const result = rule.rewrite?.(url, match!)
  expect(result?.href).toBe('https://raw.githubusercontent.com/owner/repo/HEAD/README.md')
})

test('githubRepo rewrites with trailing slash', () => {
  const rule = githubRepo()
  const url = new URL('https://github.com/owner/repo/')
  const pattern = rule.patterns[0]
  assert(pattern instanceof URLPattern)
  const match = pattern.exec(url)
  const result = rule.rewrite?.(url, match!)
  expect(result?.href).toBe('https://raw.githubusercontent.com/owner/repo/HEAD/README.md')
})

test('githubRepo pattern matches repo URLs', () => {
  const rule = githubRepo()
  const pattern = rule.patterns[0]
  assert(pattern instanceof URLPattern)
  expect(pattern.test('https://github.com/owner/repo')).toBe(true)
  expect(pattern.test('https://github.com/owner/repo/')).toBe(true)
  expect(pattern.test('https://github.com/owner/repo/issues/1')).toBe(false)
  expect(pattern.test('https://github.com/owner/repo/blob/main/file.md')).toBe(false)
})

test('githubRepo extracts readme with repo metadata', async () => {
  const md = create({
    rules: [githubRepo()],
    fetch: async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('raw.githubusercontent.com'))
        return new Response('# My Project\n\nHello world', { status: 200 })
      if (url.includes('api.github.com'))
        return new Response(
          JSON.stringify({
            full_name: 'owner/repo',
            description: 'A cool project',
            language: 'TypeScript',
            license: { spdx_id: 'MIT' },
            stargazers_count: 1234,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      return new Response(null, { status: 404 })
    },
  })
  const result = await md.fetch('https://github.com/owner/repo')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toBe('# My Project\n\nHello world')
  expect(result.meta.title).toBe('owner/repo')
  expect(result.meta.description).toBe('A cool project')
  expect(result.meta.language).toBe('TypeScript')
  expect(result.meta.license).toBe('MIT')
  expect(result.meta.stars).toBe(1234)
})

test('githubRepo works when api fails', async () => {
  const md = create({
    rules: [githubRepo()],
    fetch: async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('raw.githubusercontent.com'))
        return new Response('# Readme', { status: 200 })
      return new Response(null, { status: 403 })
    },
  })
  const result = await md.fetch('https://github.com/owner/repo')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toBe('# Readme')
})

test('githubBlob rewrites .md blob URL', () => {
  const rule = githubBlob()
  const url = new URL('https://github.com/owner/repo/blob/main/docs/README.md')
  const pattern = rule.patterns[0]
  assert(pattern instanceof URLPattern)
  const match = pattern.exec(url)
  const result = rule.rewrite?.(url, match!)
  expect(result?.href).toBe('https://raw.githubusercontent.com/owner/repo/main/docs/README.md')
})

test('githubBlob ignores non-md files', () => {
  const rule = githubBlob()
  const url = new URL('https://github.com/owner/repo/blob/main/src/index.ts')
  const pattern = rule.patterns[0]
  assert(pattern instanceof URLPattern)
  const match = pattern.exec(url)
  const result = rule.rewrite?.(url, match!)
  expect(result).toBeUndefined()
})

test('githubBlob rewrites .mdx blob URL', () => {
  const rule = githubBlob()
  const url = new URL('https://github.com/owner/repo/blob/main/docs/page.mdx')
  const pattern = rule.patterns[0]
  assert(pattern instanceof URLPattern)
  const match = pattern.exec(url)
  const result = rule.rewrite?.(url, match!)
  expect(result?.href).toBe('https://raw.githubusercontent.com/owner/repo/main/docs/page.mdx')
})

test('githubIssue rewrites to API URL', () => {
  const rule = githubIssue()
  const url = new URL('https://github.com/wevm/viem/issues/123')
  const pattern = rule.patterns[0]
  assert(pattern instanceof URLPattern)
  const match = pattern.exec(url)
  const result = rule.rewrite?.(url, match!)
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
  const url = new URL('https://github.com/wevm/viem/pull/456')
  const pattern = rule.patterns[0]
  assert(pattern instanceof URLPattern)
  const match = pattern.exec(url)
  const result = rule.rewrite?.(url, match!)
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
  const pattern = rule.patterns[0]
  assert(pattern instanceof URLPattern)
  expect(pattern.test('https://github.com/owner/repo/blob/main/file.md')).toBe(true)
  expect(pattern.test('https://github.com/owner/repo/issues/1')).toBe(false)
})

test('githubIssue pattern matches issue URLs', () => {
  const rule = githubIssue()
  const pattern = rule.patterns[0]
  assert(pattern instanceof URLPattern)
  expect(pattern.test('https://github.com/owner/repo/issues/123')).toBe(true)
  expect(pattern.test('https://github.com/owner/repo/issues/123/comments')).toBe(false)
})

test('githubIssue extracts comments from single-page GraphQL response', async () => {
  const md = create({
    rules: [githubIssue({ token: 'test' })],
    fetch: async () =>
      new Response(
        JSON.stringify({
          data: {
            repository: {
              issue: {
                title: 'Bug',
                body: 'Issue body',
                state: 'OPEN',
                author: { login: 'alice' },
                comments: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      body: 'First comment',
                      createdAt: '2024-01-01T00:00:00Z',
                      author: { login: 'bob' },
                    },
                  ],
                },
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  })
  const result = await md.fetch('https://github.com/wevm/viem/issues/1')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toContain('Issue body')
  expect(result.content).toContain('First comment')
  expect(result.meta.title).toBe('Bug')
  expect(result.meta.author).toBe('alice')
})

test('githubIssue paginates GraphQL comments across multiple pages', async () => {
  let callCount = 0
  const md = create({
    rules: [githubIssue({ token: 'test' })],
    fetch: async () => {
      callCount++
      const issue = {
        title: 'Paginated',
        body: 'Issue body',
        state: 'OPEN',
        author: { login: 'author' },
        comments:
          callCount === 1
            ? {
                pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
                nodes: [{ body: 'Comment 1', author: { login: 'alice' } }],
              }
            : {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ body: 'Comment 2', author: { login: 'bob' } }],
              },
      }
      return new Response(JSON.stringify({ data: { repository: { issue } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const result = await md.fetch('https://github.com/wevm/viem/issues/1')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toContain('Comment 1')
  expect(result.content).toContain('Comment 2')
  expect(result.meta.title).toBe('Paginated')
})

test('githubPr paginates GraphQL comments across multiple pages', async () => {
  let callCount = 0
  const md = create({
    rules: [githubPr({ token: 'test' })],
    fetch: async () => {
      callCount++
      const pullRequest = {
        title: 'Paginated PR',
        body: 'PR body',
        state: 'CLOSED',
        merged: true,
        author: { login: 'author' },
        comments:
          callCount === 1
            ? {
                pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
                nodes: [{ body: 'Comment 1', author: { login: 'alice' } }],
              }
            : {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ body: 'Comment 2', author: { login: 'bob' } }],
              },
      }
      return new Response(JSON.stringify({ data: { repository: { pullRequest } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  const result = await md.fetch('https://github.com/wevm/viem/pull/1')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toContain('Comment 1')
  expect(result.content).toContain('Comment 2')
  expect(result.meta.state).toBe('merged')
})

test('githubIssue returns error on stuck pagination cursor', async () => {
  const md = create({
    rules: [githubIssue({ token: 'test' })],
    fetch: async () =>
      new Response(
        JSON.stringify({
          data: {
            repository: {
              issue: {
                title: 'Stuck',
                body: 'body',
                state: 'OPEN',
                author: { login: 'author' },
                comments: {
                  pageInfo: { hasNextPage: true, endCursor: 'stuck' },
                  nodes: [{ body: 'Comment', author: { login: 'alice' } }],
                },
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  })
  const result = await md.fetch('https://github.com/wevm/viem/issues/1')
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.status).toBe(502)
  expect(result.error).toBe('Pagination cursor did not advance')
})

test('githubPr pattern matches PR URLs', () => {
  const rule = githubPr()
  const pattern = rule.patterns[0]
  assert(pattern instanceof URLPattern)
  expect(pattern.test('https://github.com/owner/repo/pull/456')).toBe(true)
  expect(pattern.test('https://github.com/owner/repo/pull/456/files')).toBe(false)
})
