import type { Element, ElementContent, Root } from 'hast'
import rehypeParse from 'rehype-parse'
import rehypeRemark from 'rehype-remark'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { z } from 'zod'
import { defineRule, type FetchContext } from '../mod.ts'

export const githubBlob = defineRule({
  key: 'githubBlob',
  patterns: [/^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\//],
  rewrite(url) {
    const [, owner, repo, , ...rest] = url.pathname.split('/')
    const path = rest.join('/')
    if (!/\.mdx?$/.test(path)) return
    return new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${path}`)
  },
})

export const githubIssue = defineRule<{ token?: string }>({
  key: 'githubIssue',
  patterns: [/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/],
  rewrite(url) {
    const [, owner, repo, , id] = url.pathname.split('/')
    return new URL(`https://api.github.com/repos/${owner}/${repo}/issues/${id}`)
  },
  fetch(url, init, context) {
    return fetchGithubApi(url, init, {
      token: context.options?.token,
      fetch: context.fetch,
    })
  },
  async extract(response) {
    const text = await response.text()

    if (text.trimStart().startsWith('<')) return parseGithubHtml(text, 'issue')

    const raw = JSON.parse(text)

    if (raw.data?.repository) {
      const entry = z.parse(graphqlIssueSchema, raw).data.repository.issue
      return formatComments(entry)
    }

    const json = z.parse(restIssueSchema, raw)
    return {
      content: (json.body ?? '').trim(),
      meta: {
        ...(json.title && { title: json.title }),
        ...(json.user?.login && { author: json.user.login }),
        ...(json.state && { state: json.state }),
      },
    }
  },
})

export const githubPr = defineRule<{ token?: string }>({
  key: 'githubPr',
  patterns: [/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/],
  rewrite(url) {
    const [, owner, repo, , id] = url.pathname.split('/')
    return new URL(`https://api.github.com/repos/${owner}/${repo}/pulls/${id}`)
  },
  fetch(url, init, context) {
    return fetchGithubApi(url, init, {
      token: context.options?.token,
      fetch: context.fetch,
    })
  },
  async extract(response) {
    const text = await response.text()

    if (text.trimStart().startsWith('<')) return parseGithubHtml(text, 'pr')

    const raw = JSON.parse(text)

    if (raw.data?.repository) {
      const entry = z.parse(graphqlPrSchema, raw).data.repository.pullRequest
      return formatComments(entry, { merged: entry.merged })
    }

    const json = z.parse(restPrSchema, raw)
    const state = json.merged ? 'merged' : json.state
    return {
      content: (json.body ?? '').trim(),
      meta: {
        ...(json.title && { title: json.title }),
        ...(json.user?.login && { author: json.user.login }),
        ...(state && { state }),
      },
    }
  },
})

async function fetchGithubApi(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  context: FetchContext & { token?: string },
) {
  const url =
    input instanceof URL
      ? input
      : new URL(typeof input === 'string' ? input : input.url)
  const userAgent = new Headers(init?.headers).get('User-Agent') ?? ''
  // API path: /repos/{owner}/{repo}/{issues|pulls}/{id}
  const [, , owner, repo, kind, id] = url.pathname.split('/')
  const isPr = kind === 'pulls'

  // Use GraphQL when authenticated to fetch comments in a single request
  if (context.token) {
    const res = await context.fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.token}`,
        'User-Agent': userAgent,
      },
      body: JSON.stringify({
        query: isPr ? prQuery : issueQuery,
        variables: { owner, repo, number: Number(id) },
      }),
    })
    if (res.ok) return res
  }

  // Unauthenticated: fetch HTML directly (includes comments, no rate limit)
  const htmlPath = isPr
    ? `/${owner}/${repo}/pull/${id}`
    : `/${owner}/${repo}/issues/${id}`
  return context.fetch(new URL(htmlPath, 'https://github.com'), {
    headers: { 'User-Agent': userAgent },
    redirect: 'follow',
  })
}

function formatComments(
  entry: {
    body?: string
    title?: string
    state?: string
    author?: { login?: string }
    comments?: {
      nodes: Array<{
        body?: string
        createdAt?: string
        author?: { login?: string }
      }>
    }
  },
  options?: { merged?: boolean },
) {
  const state = options?.merged ? 'merged' : entry.state?.toLowerCase()

  let content = (entry.body ?? '').trim()
  for (const comment of entry.comments?.nodes ?? [])
    content += `\n\n${commentTag(comment.body ?? '', comment.author?.login, comment.createdAt)}`

  return {
    content,
    meta: {
      ...(entry.title && { title: entry.title }),
      ...(entry.author?.login && { author: entry.author.login }),
      ...(state && { state }),
    },
  }
}

function commentTag(body: string, author?: string, date?: string): string {
  const attrs: string[] = []
  if (author) attrs.push(`author="${author}"`)
  if (date) attrs.push(`date="${date}"`)
  const open = attrs.length > 0 ? `<comment ${attrs.join(' ')}>` : '<comment>'
  return `${open}\n${body.trim()}\n</comment>`
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

// TODO: paginate comments — `comments(first: 100)` silently drops anything beyond 100
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

// ---------------------------------------------------------------------------
// HTML scraping (unauthenticated fallback)
// ---------------------------------------------------------------------------

async function parseGithubHtml(
  html: string,
  kind: 'issue' | 'pr',
): Promise<{ content: string; meta: Record<string, string> }> {
  const tree = unified().use(rehypeParse).parse(html)

  const title = extractTitle(tree)
  const state = extractState(tree, kind)
  const comments = extractComments(tree)
  if (comments.length === 0) return { content: '', meta: {} }

  const author = comments[0]?.author
  let content = comments[0]?.body.trim() ?? ''
  for (const comment of comments.slice(1))
    content += `\n\n${commentTag(comment.body, comment.author, comment.createdAt)}`

  return {
    content,
    meta: {
      ...(title && { title }),
      ...(author && { author }),
      ...(state && { state }),
    },
  }
}

function extractTitle(tree: Root): string | undefined {
  let title: string | undefined
  walk(tree, (el) => {
    if (title) return
    if (el.tagName !== 'span') return
    const classes = classNames(el)
    if (classes.includes('markdown-title') && !classes.includes('text-bold')) {
      const text = hastToText(el).trim()
      if (text) title = text
    }
  })
  return title
}

function extractState(tree: Root, kind: 'issue' | 'pr'): string | undefined {
  let state: string | undefined
  walk(tree, (el) => {
    if (state) return
    if (el.tagName !== 'span') return
    const classes = classNames(el)
    if (!classes.some((c) => c.includes('StateLabel'))) return
    const status = el.properties?.dataStatus as string | undefined
    if (!status) return
    if (kind === 'pr' && status === 'pullMerged') state = 'merged'
    else if (
      status === 'pullMerged' ||
      status === 'issueClosed' ||
      status === 'pullClosed'
    )
      state = 'closed'
    else if (status === 'issueOpened' || status === 'pullOpened') state = 'open'
  })
  return state
}

type HtmlComment = {
  author?: string
  body: string
  createdAt?: string
}

function extractComments(tree: Root): HtmlComment[] {
  const comments: HtmlComment[] = []
  walk(tree, (el) => {
    if (el.tagName !== 'div') return
    const classes = classNames(el)
    if (!classes.includes('js-comment-container')) return

    const author = findAuthor(el)
    const createdAt = findTimestamp(el)
    const body = findCommentBody(el)
    if (body !== undefined) comments.push({ author, body, createdAt })
  })
  return comments
}

function findAuthor(el: Element): string | undefined {
  let author: string | undefined
  walk(el, (child) => {
    if (author) return
    if (child.tagName !== 'a') return
    if (!classNames(child).includes('author')) return
    const text = hastToText(child).trim()
    if (text) author = text
  })
  return author
}

function findTimestamp(el: Element): string | undefined {
  let timestamp: string | undefined
  walk(el, (child) => {
    if (timestamp) return
    if (child.tagName !== 'relative-time') return
    const dt = (child.properties?.dateTime ?? child.properties?.datetime) as
      | string
      | undefined
    if (dt) timestamp = dt
  })
  return timestamp
}

function findCommentBody(el: Element): string | undefined {
  let body: string | undefined
  walk(el, (child) => {
    if (body !== undefined) return
    if (child.tagName !== 'td' && child.tagName !== 'div') return
    const classes = classNames(child)
    if (!classes.includes('js-comment-body')) return
    body = hastToMarkdown(child)
  })
  return body
}

function hastToMarkdown(node: Element): string {
  const tree: Root = { type: 'root', children: node.children }
  const file = unified()
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify)
    .stringify(unified().use(rehypeRemark).use(remarkGfm).runSync(tree))
  return String(file).trim()
}

function classNames(el: Element): string[] {
  const raw = el.properties?.className
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') return raw.split(/\s+/)
  return []
}

function hastToText(node: Element | ElementContent): string {
  if (node.type === 'text') return node.value
  if (node.type === 'element')
    return node.children.map((c) => hastToText(c)).join('')
  return ''
}

function walk(node: Element | Root, fn: (el: Element) => void) {
  if (!('children' in node)) return
  for (const child of node.children) {
    if (child.type !== 'element') continue
    fn(child)
    walk(child, fn)
  }
}
