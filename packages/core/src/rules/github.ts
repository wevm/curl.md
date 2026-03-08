import { z } from 'zod'
import { defineRule, type FetchContext } from '../defineRule.ts'

// TODO: add comments, etc.

export const githubBlob = defineRule({
  patterns: [/^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\//],
  resolve: (url) => {
    const [, owner, repo, , ...rest] = url.pathname.split('/')
    const path = rest.join('/')
    if (!/\.mdx?$/.test(path)) return
    return new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${path}`)
  },
})

export const githubIssue = defineRule({
  patterns: [/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/],
  resolve: (url) => {
    const [, owner, repo, , id] = url.pathname.split('/')
    return {
      url: new URL(
        `https://api.github.com/repos/${owner}/${repo}/issues/${id}`,
      ),
      headers: { Accept: 'application/vnd.github.v3+json' },
    }
  },
  fetch: fetchGithubApi,
  parse: async (response) => {
    const text = await response.text()
    if (!text.startsWith('{')) return null

    const raw = JSON.parse(text)

    if (raw.data?.repository) {
      const entry = z.parse(graphqlIssueSchema, raw).data.repository.issue

      let content = entry.body ?? ''
      for (const comment of entry.comments?.nodes ?? [])
        content += `\n\n---\n\n**${comment.author?.login ?? 'unknown'}${comment.createdAt ? ` (${comment.createdAt})` : ''}:**\n\n${comment.body ?? ''}`

      return {
        content,
        meta: {
          ...(entry.title && { title: entry.title }),
          ...(entry.author?.login && { author: entry.author.login }),
          ...(entry.state && { state: entry.state.toLowerCase() }),
        },
      }
    }

    const json = z.parse(restIssueSchema, raw)
    return {
      content: json.body ?? '',
      meta: {
        ...(json.title && { title: json.title }),
        ...(json.user?.login && { author: json.user.login }),
        ...(json.state && { state: json.state }),
      },
    }
  },
})

export const githubPr = defineRule({
  patterns: [/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/],
  resolve: (url) => {
    const [, owner, repo, , id] = url.pathname.split('/')
    return {
      url: new URL(`https://api.github.com/repos/${owner}/${repo}/pulls/${id}`),
      headers: { Accept: 'application/vnd.github.v3+json' },
    }
  },
  fetch: fetchGithubApi,
  parse: async (response) => {
    const text = await response.text()
    if (!text.startsWith('{')) return null

    const raw = JSON.parse(text)

    if (raw.data?.repository) {
      const entry = z.parse(graphqlPrSchema, raw).data.repository.pullRequest
      const state = entry.merged ? 'merged' : entry.state?.toLowerCase()

      let content = entry.body ?? ''
      for (const comment of entry.comments?.nodes ?? [])
        content += `\n\n---\n\n**${comment.author?.login ?? 'unknown'}${comment.createdAt ? ` (${comment.createdAt})` : ''}:**\n\n${comment.body ?? ''}`

      return {
        content,
        meta: {
          ...(entry.title && { title: entry.title }),
          ...(entry.author?.login && { author: entry.author.login }),
          ...(state && { state }),
        },
      }
    }

    const json = z.parse(restPrSchema, raw)
    const state = json.merged ? 'merged' : json.state
    return {
      content: json.body ?? '',
      meta: {
        ...(json.title && { title: json.title }),
        ...(json.user?.login && { author: json.user.login }),
        ...(state && { state }),
      },
    }
  },
})

async function fetchGithubApi(
  url: URL,
  resolved: { url: URL; headers: Record<string, string> },
  context: FetchContext,
) {
  const [, owner, repo, , id] = url.pathname.split('/')
  const isPr = url.pathname.includes('/pull/')

  // Use GraphQL when authenticated to fetch comments in a single request
  if (context.tokens?.github) {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.tokens.github}`,
        'User-Agent': context.userAgent,
      },
      body: JSON.stringify({
        query: isPr ? prQuery : issueQuery,
        variables: { owner, repo, number: Number(id) },
      }),
    })
    if (res.ok) return res
  }

  // Unauthenticated or GraphQL failed: fall back to REST (no comments)
  const headers: Record<string, string> = {
    ...resolved.headers,
    'User-Agent': context.userAgent,
  }
  const res = await fetch(resolved.url, { headers, redirect: 'follow' })
  // Rate-limited: fall back to scraping the original HTML page
  if (res.status === 403 || res.status === 429)
    return fetch(url, {
      headers: { 'User-Agent': context.userAgent },
      redirect: 'follow',
    })
  return res
}

const commentSchema = z.object({
  body: z.string().optional(),
  createdAt: z.string().optional(),
  author: z.object({ login: z.string().optional() }).optional(),
})

const graphqlIssueSchema = z.object({
  data: z.object({
    repository: z.object({
      issue: z.object({
        title: z.string().optional(),
        body: z.string().optional(),
        state: z.string().optional(),
        author: z.object({ login: z.string().optional() }).optional(),
        comments: z.object({ nodes: z.array(commentSchema) }).optional(),
      }),
    }),
  }),
})

const graphqlPrSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        title: z.string().optional(),
        body: z.string().optional(),
        state: z.string().optional(),
        merged: z.boolean().optional(),
        author: z.object({ login: z.string().optional() }).optional(),
        comments: z.object({ nodes: z.array(commentSchema) }).optional(),
      }),
    }),
  }),
})

const restIssueSchema = z.object({
  body: z.string().optional(),
  title: z.string().optional(),
  state: z.string().optional(),
  user: z.object({ login: z.string().optional() }).optional(),
})

const restPrSchema = z.object({
  body: z.string().optional(),
  title: z.string().optional(),
  state: z.string().optional(),
  merged: z.boolean().optional(),
  user: z.object({ login: z.string().optional() }).optional(),
})

const issueQuery = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      title
      body
      state
      author { login }
      comments(first: 100) {
        nodes { body, createdAt, author { login } }
      }
    }
  }
}`

const prQuery = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      title
      body
      state
      merged
      author { login }
      comments(first: 100) {
        nodes { body, createdAt, author { login } }
      }
    }
  }
}`
