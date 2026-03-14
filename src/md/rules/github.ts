import type { Element, ElementContent, Root } from 'hast'
import rehypeParse from 'rehype-parse'
import rehypeRemark from 'rehype-remark'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { z } from 'zod'
import { defineRule, type FetchContext, type Meta } from '../mod.ts'

export const githubRepo = defineRule<{ token?: string | undefined }>({
  key: 'githubRepo',
  patterns: [/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/],
  rewrite(url) {
    const [, owner, repo] = url.pathname.split('/')
    return new URL(
      `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`,
    )
  },
  async fetch(input, init, context) {
    const url =
      input instanceof URL
        ? input
        : new URL(typeof input === 'string' ? input : input.url)
    const userAgent = new Headers(init?.headers).get('User-Agent') ?? ''
    // url is the rewritten raw.githubusercontent.com URL
    // Extract owner/repo from it: /owner/repo/HEAD/README.md
    const [, owner, repo] = url.pathname.split('/')

    const apiHeaders: Record<string, string> = { 'User-Agent': userAgent }
    if (context.options?.token)
      apiHeaders.Authorization = `Bearer ${context.options.token}`

    const [readmeRes, repoRes] = await Promise.all([
      context.fetch(url, init),
      context
        .fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          headers: apiHeaders,
        })
        .catch(() => null),
    ])

    if (!readmeRes.ok) return readmeRes

    const readme = await readmeRes.text()
    const repoInfo = await (async () => {
      if (!repoRes?.ok) return null
      try {
        return z.parse(restRepoSchema, await repoRes.json())
      } catch {
        return null
      }
    })()

    return new Response(JSON.stringify({ readme, repoInfo }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  },
  async extract(response) {
    const { readme, repoInfo } = (await response.json()) as {
      readme: string
      repoInfo: z.infer<typeof restRepoSchema> | null
    }
    const split = splitRawFrontmatter(readme)
    const meta: Meta = { ...split.meta }
    if (repoInfo) {
      if (repoInfo.full_name) meta.title = repoInfo.full_name
      if (repoInfo.description) meta.description = repoInfo.description
      if (repoInfo.language) meta.language = repoInfo.language
      if (repoInfo.license?.spdx_id) meta.license = repoInfo.license.spdx_id
      if (repoInfo.stargazers_count) meta.stars = repoInfo.stargazers_count
    }
    return { content: split.body, meta }
  },
})

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

export const githubIssue = defineRule<{ token?: string | undefined }>({
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
        ...(json.number && { number: json.number }),
        ...(json.title && { title: json.title }),
        ...(json.user?.login && { author: json.user.login }),
        ...(json.state && { state: json.state }),
        ...(json.created_at && { created_at: json.created_at }),
        ...(json.updated_at && { updated_at: json.updated_at }),
      },
    }
  },
})

export const githubPr = defineRule<{ token?: string | undefined }>({
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
      return formatComments(entry, {
        merged: entry.merged,
        isDraft: entry.isDraft,
        baseRef: entry.baseRefName,
        headRef: entry.headRefName,
      })
    }

    const json = z.parse(restPrSchema, raw)
    const state = json.merged ? 'merged' : json.draft ? 'draft' : json.state
    return {
      content: (json.body ?? '').trim(),
      meta: {
        ...(json.number && { number: json.number }),
        ...(json.title && { title: json.title }),
        ...(json.user?.login && { author: json.user.login }),
        ...(state && { state }),
        ...(json.created_at && { created_at: json.created_at }),
        ...(json.updated_at && { updated_at: json.updated_at }),

        ...(json.base?.ref && { base_ref: json.base.ref }),
        ...(json.head?.ref && { head_ref: json.head.ref }),
      },
    }
  },
})

async function fetchGithubApi(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  context: FetchContext & { token?: string | undefined },
) {
  const url =
    input instanceof URL
      ? input
      : new URL(typeof input === 'string' ? input : input.url)
  const userAgent = new Headers(init?.headers).get('User-Agent') ?? ''
  // API path: /repos/{owner}/{repo}/{issues|pulls}/{id}
  const [, , owner, repo, kind, id] = url.pathname.split('/')
  const isPr = kind === 'pulls'

  // Use GraphQL when authenticated to fetch comments with pagination
  if (context.token) {
    let cursor: string | null = null
    const allComments: z.infer<typeof commentSchema>[] = []
    let firstResponse: Record<string, unknown> | undefined

    while (true) {
      const res: Response = await context.fetch(
        'https://api.github.com/graphql',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${context.token}`,
            'User-Agent': userAgent,
          },
          body: JSON.stringify({
            query: isPr ? prQuery : issueQuery,
            variables: { owner, repo, number: Number(id), cursor },
          }),
        },
      )
      if (!res.ok) return res

      const raw = await res.json()
      const entry = isPr
        ? z.parse(graphqlPrSchema, raw).data.repository.pullRequest
        : z.parse(graphqlIssueSchema, raw).data.repository.issue
      const pageInfo = entry.comments?.pageInfo

      if (!firstResponse) firstResponse = raw as Record<string, unknown>
      allComments.push(...(entry.comments?.nodes ?? []))

      if (!pageInfo?.hasNextPage) break
      if (pageInfo.endCursor === cursor)
        throw new Error('Pagination cursor did not advance')
      cursor = pageInfo.endCursor
    }

    // Patch first response with all accumulated comments
    if (isPr) {
      const parsed = z.parse(graphqlPrSchema, firstResponse)
      if (parsed.data.repository.pullRequest.comments)
        parsed.data.repository.pullRequest.comments.nodes = allComments
      firstResponse = parsed
    } else {
      const parsed = z.parse(graphqlIssueSchema, firstResponse)
      if (parsed.data.repository.issue.comments)
        parsed.data.repository.issue.comments.nodes = allComments
      firstResponse = parsed
    }

    return new Response(JSON.stringify(firstResponse), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
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
    number?: number | undefined
    body?: string | undefined
    title?: string | undefined
    state?: string | undefined
    createdAt?: string | undefined
    updatedAt?: string | undefined
    author?: { login?: string | undefined } | undefined
    comments?:
      | {
          nodes: Array<{
            body?: string | undefined
            createdAt?: string | undefined
            author?: { login?: string | undefined } | undefined
          }>
        }
      | undefined
  },
  options?: {
    merged?: boolean | undefined
    isDraft?: boolean | undefined
    baseRef?: string | undefined
    headRef?: string | undefined
  },
) {
  const state = options?.merged
    ? 'merged'
    : options?.isDraft
      ? 'draft'
      : entry.state?.toLowerCase()

  let content = (entry.body ?? '').trim()
  for (const comment of entry.comments?.nodes ?? [])
    content += `\n\n${commentTag(comment.body ?? '', comment.author?.login, comment.createdAt)}`

  return {
    content,
    meta: {
      ...(entry.number && { number: entry.number }),
      ...(entry.title && { title: entry.title }),
      ...(entry.author?.login && { author: entry.author.login }),
      ...(state && { state }),
      ...(entry.createdAt && { created_at: entry.createdAt }),
      ...(entry.updatedAt && { updated_at: entry.updatedAt }),

      ...(options?.baseRef && { base_ref: options.baseRef }),
      ...(options?.headRef && { head_ref: options.headRef }),
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
        number: z.number().optional(),
        title: z.string().optional(),
        body: z.string().optional(),
        state: z.string().optional(),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
        author: z.object({ login: z.string().optional() }).optional(),
        comments: z
          .object({
            nodes: z.array(commentSchema),
            pageInfo: z
              .object({
                hasNextPage: z.boolean(),
                endCursor: z.string().nullable(),
              })
              .optional(),
          })
          .optional(),
      }),
    }),
  }),
})

const graphqlPrSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        number: z.number().optional(),
        title: z.string().optional(),
        body: z.string().optional(),
        state: z.string().optional(),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
        merged: z.boolean().optional(),
        isDraft: z.boolean().optional(),
        author: z.object({ login: z.string().optional() }).optional(),
        baseRefName: z.string().optional(),
        headRefName: z.string().optional(),
        comments: z
          .object({
            nodes: z.array(commentSchema),
            pageInfo: z
              .object({
                hasNextPage: z.boolean(),
                endCursor: z.string().nullable(),
              })
              .optional(),
          })
          .optional(),
      }),
    }),
  }),
})

const restIssueSchema = z.object({
  number: z.number().optional(),
  body: z.string().optional(),
  title: z.string().optional(),
  state: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  user: z.object({ login: z.string().optional() }).optional(),
})

const restPrSchema = z.object({
  number: z.number().optional(),
  body: z.string().optional(),
  title: z.string().optional(),
  state: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  merged: z.boolean().optional(),
  draft: z.boolean().optional(),
  user: z.object({ login: z.string().optional() }).optional(),
  base: z.object({ ref: z.string().optional() }).optional(),
  head: z.object({ ref: z.string().optional() }).optional(),
})

const restRepoSchema = z.object({
  full_name: z.string().optional(),
  description: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  license: z
    .object({ spdx_id: z.string().nullable().optional() })
    .nullable()
    .optional(),
  stargazers_count: z.number().optional(),
})

const issueQuery = `
query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      number
      title
      body
      state
      createdAt
      updatedAt
      author { login }
      comments(first: 100, after: $cursor) {
        nodes { body, createdAt, author { login } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`

const prQuery = `
query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number
      title
      body
      state
      createdAt
      updatedAt
      merged
      isDraft
      author { login }
      baseRefName
      headRefName
      comments(first: 100, after: $cursor) {
        nodes { body, createdAt, author { login } }
        pageInfo { hasNextPage endCursor }
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
): Promise<{ content: string; meta: Meta }> {
  const tree = unified().use(rehypeParse).parse(html)

  const title = extractTitle(tree)
  const number = extractNumber(tree)
  const state = extractState(tree, kind)
  const comments = extractComments(tree)
  if (comments.length === 0) return { content: '', meta: {} }

  const author = comments[0]?.author
  const createdAt = comments[0]?.createdAt
  const lastComment = comments[comments.length - 1]
  const updatedAt = comments.length > 1 ? lastComment?.createdAt : undefined
  let content = comments[0]?.body.trim() ?? ''
  for (const comment of comments.slice(1))
    content += `\n\n${commentTag(comment.body, comment.author, comment.createdAt)}`

  const refs = kind === 'pr' ? extractBranchRefs(tree) : undefined

  return {
    content,
    meta: {
      ...(number && { number }),
      ...(title && { title }),
      ...(author && { author }),
      ...(state && { state }),
      ...(createdAt && { created_at: createdAt }),
      ...(updatedAt && { updated_at: updatedAt }),

      ...(refs?.base && { base_ref: refs.base }),
      ...(refs?.head && { head_ref: refs.head }),
    },
  }
}

function extractNumber(tree: Root): number | undefined {
  let num: number | undefined
  walk(tree, (el) => {
    if (num) return
    if (el.tagName !== 'h1') return
    const text = hastToText(el)
    const match = text.match(/#(\d+)\s*$/)
    if (match) num = Number(match[1])
  })
  return num
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
    if (status === 'draft') state = 'draft'
    else if (kind === 'pr' && status === 'pullMerged') state = 'merged'
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
  author?: string | undefined
  body: string
  createdAt?: string | undefined
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

function extractBranchRefs(
  tree: Root,
): { base?: string | undefined; head?: string | undefined } | undefined {
  const refs: string[] = []
  walk(tree, (el) => {
    if (refs.length >= 2) return
    if (el.tagName !== 'a') return
    if (!classNames(el).some((c) => c.includes('BranchName'))) return
    const text = hastToText(el).trim()
    if (text) refs.push(text.replace(/^[^:]+:/, ''))
  })
  if (refs.length === 0) return undefined
  return { base: refs[0], head: refs[1] }
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

function splitRawFrontmatter(markdown: string): {
  body: string
  meta: Record<string, string>
} {
  if (!markdown.startsWith('---\n')) return { body: markdown, meta: {} }
  const end = markdown.indexOf('\n---\n', 4)
  if (end === -1) return { body: markdown, meta: {} }
  const body = markdown.slice(end + 5).replace(/^\n+/, '')
  const meta: Record<string, string> = {}
  const lines = markdown.slice(4, end).split('\n')
  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    if (line[0] === ' ' || line[0] === '\t') continue
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1)
    if (key && value) meta[key] = value
  }
  return { body, meta }
}
