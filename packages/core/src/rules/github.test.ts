import { assert, expect, test } from 'vitest'
import { resolve } from '../resolve.ts'
import { githubIssue, githubPr } from './github.ts'
import * as rules from './index.ts'

test('resolves blob to raw', () => {
  const result = resolve(
    'https://github.com/owner/repo/blob/main/README.md',
    rules,
  )
  expect(result.url.href).toBe(
    'https://raw.githubusercontent.com/owner/repo/main/README.md',
  )
})

test('ignores non-md blob', () => {
  const result = resolve(
    'https://github.com/owner/repo/blob/main/index.ts',
    rules,
  )
  expect(result.url.href).toBe(
    'https://github.com/owner/repo/blob/main/index.ts',
  )
})

test('resolves issue to api', () => {
  const result = resolve('https://github.com/owner/repo/issues/42', rules)
  expect(result.url.href).toBe(
    'https://api.github.com/repos/owner/repo/issues/42',
  )
  expect(result.headers.Accept).toBe('application/vnd.github.v3+json')
})

test('resolves PR to api', () => {
  const result = resolve('https://github.com/owner/repo/pull/123', rules)
  expect(result.url.href).toBe(
    'https://api.github.com/repos/owner/repo/pulls/123',
  )
  expect(result.headers.Accept).toBe('application/vnd.github.v3+json')
})

test('issue rule does not match PR urls', () => {
  const result = resolve('https://github.com/owner/repo/pull/42', rules)
  expect(result.url.href).not.toContain('/issues/')
})

test('PR rule does not match issue urls', () => {
  const result = resolve('https://github.com/owner/repo/issues/42', rules)
  expect(result.url.href).not.toContain('/pulls/')
})

test('blob rule does not match issue or PR urls', () => {
  const issue = resolve('https://github.com/owner/repo/issues/42', rules)
  expect(issue.url.href).not.toContain('raw.githubusercontent.com')
  const pr = resolve('https://github.com/owner/repo/pull/42', rules)
  expect(pr.url.href).not.toContain('raw.githubusercontent.com')
})

test('ignores unmatched paths', () => {
  const result = resolve('https://github.com/owner/repo', rules)
  expect(result.url.href).toBe('https://github.com/owner/repo')
})

test('ignores issues listing path', () => {
  const result = resolve('https://github.com/owner/repo/issues', rules)
  expect(result.url.href).toBe('https://github.com/owner/repo/issues')
})

test('ignores pull listing path', () => {
  const result = resolve('https://github.com/owner/repo/pulls', rules)
  expect(result.url.href).toBe('https://github.com/owner/repo/pulls')
})

test('parses issue API response', async () => {
  const json = {
    title: 'Bug: something broken',
    body: '## Steps to reproduce\n\n1. Do this\n2. See error',
    state: 'open',
    user: { login: 'octocat' },
  }
  const res = new Response(JSON.stringify(json))
  const result = await githubIssue.parse(res)
  assert(result)
  expect(result.content).toBe(
    '## Steps to reproduce\n\n1. Do this\n2. See error',
  )
  expect(result.meta?.title).toBe('Bug: something broken')
  expect(result.meta?.author).toBe('octocat')
  expect(result.meta?.state).toBe('open')
})

test('parses merged PR API response', async () => {
  const json = {
    title: 'feat: add feature',
    body: 'This PR adds a feature.',
    state: 'closed',
    merged: true,
    user: { login: 'contributor' },
  }
  const res = new Response(JSON.stringify(json))
  const result = await githubPr.parse(res)
  assert(result)
  expect(result.meta?.state).toBe('merged')
  expect(result.meta?.author).toBe('contributor')
})

test('parse returns null for non-json response', async () => {
  const res = new Response('<html><body>Fallback</body></html>')
  const result = await githubIssue.parse(res)
  expect(result).toBeNull()
})

test('parses GraphQL issue response with comments', async () => {
  const json = {
    data: {
      repository: {
        issue: {
          title: 'Bug report',
          body: 'Something broke.',
          state: 'OPEN',
          author: { login: 'octocat' },
          comments: {
            nodes: [
              { body: 'I can reproduce this.', author: { login: 'alice' } },
              { body: 'Fixed in #99.', author: { login: 'bob' } },
            ],
          },
        },
      },
    },
  }
  const res = new Response(JSON.stringify(json))
  const result = await githubIssue.parse(res)
  assert(result)
  expect(result.content).toContain('Something broke.')
  expect(result.content).toContain('**alice:**')
  expect(result.content).toContain('I can reproduce this.')
  expect(result.content).toContain('**bob:**')
  expect(result.content).toContain('Fixed in #99.')
  expect(result.meta?.title).toBe('Bug report')
  expect(result.meta?.author).toBe('octocat')
  expect(result.meta?.state).toBe('open')
})

test('parses GraphQL PR response with comments', async () => {
  const json = {
    data: {
      repository: {
        pullRequest: {
          title: 'feat: new feature',
          body: 'Adds a feature.',
          state: 'CLOSED',
          merged: true,
          author: { login: 'contributor' },
          comments: {
            nodes: [{ body: 'LGTM', author: { login: 'reviewer' } }],
          },
        },
      },
    },
  }
  const res = new Response(JSON.stringify(json))
  const result = await githubPr.parse(res)
  assert(result)
  expect(result.meta?.state).toBe('merged')
  expect(result.meta?.author).toBe('contributor')
  expect(result.content).toContain('Adds a feature.')
  expect(result.content).toContain('**reviewer:**')
  expect(result.content).toContain('LGTM')
})
