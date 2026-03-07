import { allowedFrontmatterKeys, fromHtml } from './markdown.ts'
import type { resolve } from './resolve.ts'
import { builtinRules } from './rules.ts'
import type { Compute } from './types.ts'

export async function parse(
  input: Response | string,
  options?: parse.Options,
): Promise<Compute<parse.ReturnType>> {
  let content: string
  let from: parse.ReturnType['from']
  let meta: Record<string, string>

  const rule = (() => {
    if (options?.rule) return options.rule
    const hostname = options?.source?.hostname
    if (!hostname) return undefined
    return builtinRules.get(hostname)
  })()

  if (rule?.parse) {
    const response = typeof input === 'string' ? new Response(input) : input
    const result = await rule.parse(response)
    content = result.markdown
    from = 'rule'
    meta = result.meta ?? {}
  } else {
    const text = typeof input === 'string' ? input : await input.text()
    const isMarkdown = (() => {
      if (options?.as) return options.as === 'md'
      if (typeof input === 'string') return !input.trimStart().startsWith('<')
      return isMarkdownContentType(input.headers.get('content-type') ?? '')
    })()

    if (isMarkdown) {
      const split = splitFrontmatter(text)
      content = split.body
      meta = {}
      for (const [k, v] of Object.entries(split.meta)) {
        if (allowedFrontmatterKeys.has(k)) meta[k] = v
      }
      from = 'markdown'
    } else {
      const baseUrl =
        options?.baseUrl ?? options?.source?.href ?? options?.url?.href
      const result = await fromHtml(text, { baseUrl })
      content = result.markdown
      meta = result.meta
      from = 'html'
    }
  }

  // Derive missing meta from context
  const hostname = options?.source?.hostname
  if (hostname) meta.site ??= hostname
  const pageUrl = options?.source?.href
  if (pageUrl) meta.url ??= pageUrl

  return { content, from, meta }
}

export namespace parse {
  export type Options = Partial<resolve.ReturnType> & {
    as?: 'html' | 'md'
    baseUrl?: string
    extractMeta?: boolean
    normalizeHeadings?: boolean
    resolveLinks?: boolean
    stripNoise?: boolean
  }
  export type ReturnType = {
    content: string
    from: 'html' | 'markdown' | 'rule'
    meta: Record<string, string>
  }
}

function isMarkdownContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase()
  return ct.includes('text/markdown') || ct.includes('text/x-markdown')
}

function splitFrontmatter(markdown: string): {
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
