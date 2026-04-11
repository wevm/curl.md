import { estimateTokenCount } from 'tokenx'
import type { DB } from '#db/types.gen.ts'
import { filterFrontmatterKeys, fromHtml } from './fromHtml.ts'

export function create(options: create.Options = {}): create.ReturnType {
  const rules = (() => {
    if (!options.rules) return []
    if (Array.isArray(options.rules)) return options.rules
    return Object.values(options.rules).map((r) => (typeof r === 'function' ? r() : r))
  })()

  return {
    async fetch(input, init) {
      const inputURL = (() => {
        if (input instanceof URL) return input
        if (input instanceof Request) return new URL(input.url)
        return new URL(input)
      })()

      const matched = (() => {
        for (const rule of rules) {
          for (const pattern of rule.patterns) {
            const match = pattern.exec(inputURL)
            if (match) return { rule, match }
          }
        }
      })()

      const rewrittenUrl = matched?.rule?.rewrite?.(inputURL, matched.match) ?? inputURL
      const requestInit = {
        ...init,
        headers: {
          ...options.headers,
          ...init?.headers,
        },
        redirect: init?.redirect ?? 'follow',
      } satisfies RequestInit
      const context = {
        fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      } satisfies FetchContext

      let response: Response
      try {
        if (matched?.rule?.fetch)
          response = await matched.rule.fetch(rewrittenUrl, requestInit, context)
        else if (options.transport) {
          const result = await options.transport(rewrittenUrl, requestInit, {
            ...context,
            previous: undefined,
          })
          response = result ?? new Response(null, { status: 500 })
        } else response = await context.fetch(rewrittenUrl, requestInit)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false as const, status: 502, error: message }
      }

      if (!response.ok) return { ok: false as const, status: response.status }

      const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
      const isMarkdown =
        contentType.includes('text/markdown') ||
        contentType.includes('text/x-markdown') ||
        /\.mdx?$/i.test(rewrittenUrl.pathname)
      const usesShortcut =
        rewrittenUrl.href !== inputURL.href ||
        Boolean(matched?.rule?.extract) ||
        Boolean(matched?.rule?.fetch)
      let sourceTokens: number | undefined
      let sourceTokensMethod: DB.request['source_tokens_method'] = usesShortcut
        ? 'estimated'
        : 'markdown'

      const result = await (async () => {
        if (matched?.rule?.extract) {
          if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
            sourceTokens = estimateTokenCount(await response.clone().text())
            sourceTokensMethod = 'html'
          }
          return matched.rule.extract(response)
        }

        const text = await response.text()

        if (isMarkdown) {
          const split = splitFrontmatter(text)
          return {
            content: rewrittenUrl.pathname.endsWith('.mdx') ? normalizeMdx(split.body) : split.body,
            meta: filterFrontmatterKeys(split.meta),
          }
        }

        sourceTokens = estimateTokenCount(text)
        sourceTokensMethod = 'html'
        return fromHtml(text, { baseUrl: inputURL.href })
      })()

      result.meta ??= {}
      result.meta.site ??= inputURL.hostname
      result.meta.url ??= inputURL.href

      return {
        ok: true as const,
        status: response.status,
        content: normalizeMarkdown(result.content, inputURL.origin),
        meta: sortMeta(result.meta),
        extras: {
          source_tokens: sourceTokens,
          source_tokens_method: sourceTokensMethod,
        },
      }
    },
  }
}

export namespace create {
  export type Options = {
    fetch?: typeof globalThis.fetch | undefined
    transport?: Transport | undefined
    headers?: HeadersInit | undefined
    rules?: Rule[] | Record<string, Rule | (() => Rule)> | undefined
  }

  export type ReturnType = {
    fetch: (
      input: RequestInfo | URL,
      init?: RequestInit | undefined,
    ) => Promise<
      | {
          ok: true
          status: number
          content: string
          meta: Meta
          extras: {
            source_tokens: number | undefined
            source_tokens_method: DB.request['source_tokens_method']
          }
        }
      | { ok: false; status: number; error?: string }
    >
  }
}

export type Rule = {
  patterns: URLPattern[]
  rewrite?: (url: URL, match: URLPatternResult) => URL | undefined
  fetch?: (
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    context: FetchContext,
  ) => Promise<Response>
  extract?: (response: Response) => Promise<{ content: string; meta?: Meta | undefined }>
}

export function defineRule<options = void>(
  config: defineRule.Config<options>,
): defineRule.ReturnType<options> {
  const configFetch = config.fetch
  function factory(options?: options): Rule {
    return {
      patterns: config.patterns,
      ...(config.rewrite && { rewrite: config.rewrite }),
      ...(config.extract && { extract: config.extract }),
      ...(configFetch && {
        fetch(input: RequestInfo | URL, init: RequestInit | undefined, context: FetchContext) {
          return configFetch(input, init, {
            ...context,
            options: options as options,
          })
        },
      }),
    }
  }
  return Object.assign(factory, {
    key: config.key,
    ...(config.checks && { checks: config.checks }),
  })
}

export namespace defineRule {
  export type Config<options = void> = { key: string; checks?: CheckCase[] } & Omit<
    Rule,
    'fetch'
  > & {
      fetch?: (
        input: RequestInfo | URL,
        init: RequestInit | undefined,
        context: FetchContext & { options: options },
      ) => Promise<Response>
    }

  export type ReturnType<options = void> = ((options?: options) => Rule) & {
    key: string
    checks?: CheckCase[]
  }
}

type CheckCase = {
  url: string
  contains?: string[]
  notContains?: string[]
  title?: string
  minLength?: number
}

export type Transport = (
  url: URL,
  init: RequestInit | undefined,
  context: FetchContext & { previous: Response | undefined },
) => Promise<Response | null>

export function defineTransport<options = void>(
  handler: (
    url: URL,
    init: RequestInit | undefined,
    context: FetchContext & {
      options: options
      previous: Response | undefined
    },
  ) => Promise<Response | null>,
): (options?: options) => Transport {
  return (options?: options): Transport =>
    (url, init, context) =>
      handler(url, init, { ...context, options: options as options })
}

export type FetchContext = { fetch: typeof globalThis.fetch }

export type Meta = Record<string, YamlValue>
type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue }

const metaKeyPriority: Record<string, number> = {
  title: 0,
  subtitle: 1,
  description: 2,
  url: 3,
  site: 4,
  author: 5,
  publish_date: 6,
}

function sortMeta(meta: Meta): Meta {
  return Object.fromEntries(
    Object.entries(meta).sort(
      ([a], [b]) => (metaKeyPriority[a] ?? 99) - (metaKeyPriority[b] ?? 99),
    ),
  )
}

function splitFrontmatter(markdown: string): {
  body: string
  meta: Meta
} {
  if (!markdown.startsWith('---\n')) return { body: markdown, meta: {} }
  const end = markdown.indexOf('\n---\n', 4)
  if (end === -1) return { body: markdown, meta: {} }
  const body = markdown.slice(end + 5).replace(/^\n+/, '')
  const meta: Record<string, string> = {}
  const lines = markdown.slice(4, end).split('\n')
  let currentKey: string | undefined
  let currentValue = ''

  const flush = () => {
    if (currentKey && currentValue) meta[currentKey] = currentValue
  }

  for (const line of lines) {
    if ((line[0] === ' ' || line[0] === '\t') && currentKey) {
      currentValue = `${currentValue} ${line.trim()}`.trim()
      continue
    }

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    flush()
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1)
    currentKey = key || undefined
    currentValue = value
  }
  flush()
  return { body, meta }
}

function normalizeMdx(content: string): string {
  return normalizeFencedCodeBlockIndentation(
    content
      .replace(/^import\s+[\s\S]+?from\s+['"][^'"]+['"];?\n*/gm, '')
      .replace(/^import\s+['"][^'"]+['"];?\n*/gm, '')
      .replace(/<Type\s+text=(?:\{)?(?:"([^"]+)"|'([^']+)')(?:\})?\s*\/>/g, (_, a, b) => {
        return ` \`${a ?? b}\``
      })
      .replace(/<MetaInfo\s+text=(?:\{)?(?:"([^"]+)"|'([^']+)')(?:\})?\s*\/>/g, (_, a, b) => {
        return ` _${a ?? b}_`
      })
      .replace(/^\s*<Render\b[\s\S]*?\/>\s*\n*/gm, '')
      .replace(/^<a\b[\s\S]*?<InlineBadge\b[^>]*\/>\s*<\/a>\s*\n*/gm, '')
      .replace(/<br\s*\/>/g, '')
      .replace(/^\s*<[A-Z][A-Za-z0-9]*(?:\s[^>\n]*)?\/>\s*$/gm, '')
      .replace(/^\s*<\/?[A-Z][A-Za-z0-9]*(?:\s[^>\n]*)?>\s*$/gm, ''),
  )
}

function normalizeFencedCodeBlockIndentation(content: string): string {
  let fenceIndent: string | null = null
  return content
    .split('\n')
    .map((line) => {
      if (fenceIndent === null) {
        const match = line.match(/^([ \t]*)```/)
        if (match) fenceIndent = match[1] ?? ''
        return line
      }

      if (line.startsWith(fenceIndent + '```')) {
        fenceIndent = null
        return line
      }

      return line.replace(/^[ \t]+(?=\S)/, (ws) => ws.replace(/\t/g, '  '))
    })
    .join('\n')
}

function normalizeMarkdown(content: string, origin?: string): string {
  return (
    content
      // Remove links with no text (e.g. `[](/)`)
      .replace(/\[]\([^)]*\) */g, '')
      // Relativize same-origin absolute URLs in markdown links/images
      .replace(/(!?\[[^\]]*\])\((https?:\/\/[^)]+)\)/g, (match, label, url) => {
        if (!origin || !url.startsWith(origin)) return match
        const relative = url.slice(origin.length) || '/'
        return `${label}(${relative})`
      })
      // Strip utm_* query params from markdown links
      .replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, text, url) => {
        try {
          const parsed = new URL(url)
          const keys = [...parsed.searchParams.keys()]
          let changed = false
          for (const key of keys) {
            if (key.startsWith('utm_')) {
              parsed.searchParams.delete(key)
              changed = true
            }
          }
          if (!changed) return match
          let href = parsed.toString()
          if (parsed.searchParams.size === 0) href = href.replace(/\?$/, '')
          return `[${text}](${href})`
        } catch {
          return match
        }
      })
      // Strip "Built with [Mintlify](...)" lines
      .replace(/\n*Built with \[Mintlify\]\([^)]*\)\.?\n*/g, '\n')
      // Normalize GFM table separator rows to use `| --- |`
      .replace(/^(\| *:?)-+([ :]*\|(?:[ :]*-+[ :]*\|)*)\s*$/gm, (match) =>
        match.replace(/\| *(:?)-+(:?) */g, '| $1---$2 '),
      )
      // Strip extra padding from table cells (skip separator rows)
      .replace(/^(\|.*\|)[^\S\n]*$/gm, (row) => {
        if (/^\|[ :]*-+[ :]*\|/.test(row)) return row
        return row
          .replace(/\|\s*$/g, '|')
          .replace(/\| +/g, '| ')
          .replace(/ +\|/g, ' |')
      })
      .trim()
  )
}
