import { filterFrontmatterKeys, fromHtml } from './fromHtml.ts'

export function create(options: create.Options = {}): create.ReturnType {
  const rules = (() => {
    if (!options.rules) return []
    if (Array.isArray(options.rules)) return options.rules
    return Object.values(options.rules).map((r) =>
      typeof r === 'function' ? r() : r,
    )
  })()

  return {
    async fetch(input, init) {
      const inputURL = (() => {
        if (input instanceof URL) return input
        if (input instanceof Request) return new URL(input.url)
        return new URL(input)
      })()

      const rule = (() => {
        for (const rule of rules) {
          for (const pattern of rule.patterns) {
            if (typeof pattern === 'string') {
              if (pattern === inputURL.hostname) return rule
            } else if (pattern.test(inputURL.href)) return rule
          }
        }
      })()

      const rewrittenUrl = rule?.rewrite?.(inputURL) ?? inputURL
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
      if (rule?.fetch)
        response = await rule.fetch(rewrittenUrl, requestInit, context)
      else if (options.transport) {
        const result = await options.transport(rewrittenUrl, requestInit, {
          ...context,
          previous: undefined,
        })
        response = result ?? new Response(null, { status: 500 })
      } else {
        response = await context.fetch(rewrittenUrl, requestInit)
      }

      if (!response.ok)
        return {
          ok: false as const,
          status: response.status,
          content: '',
          meta: {},
        }

      const result = await (async () => {
        if (rule?.extract) return rule.extract(response)

        const text = await response.text()
        const contentType = (
          response.headers.get('content-type') ?? ''
        ).toLowerCase()
        const isMarkdown =
          contentType.includes('text/markdown') ||
          contentType.includes('text/x-markdown')

        if (isMarkdown) {
          const split = splitFrontmatter(text)
          return {
            content: split.body,
            meta: filterFrontmatterKeys(split.meta),
          }
        }

        return fromHtml(text, { baseUrl: inputURL.href })
      })()

      result.meta ??= {}
      result.meta.site ??= inputURL.hostname
      result.meta.url ??= inputURL.href

      return {
        ok: true as const,
        status: response.status,
        content: normalizeMarkdown(result.content),
        meta: sortMeta(result.meta),
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
      | { ok: true; status: number; content: string; meta: Meta }
      | { ok: false; status: number; content: ''; meta: Meta }
    >
  }
}

export type Rule = {
  patterns: (string | RegExp)[]
  rewrite?: (url: URL) => URL | undefined
  fetch?: (
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    context: FetchContext,
  ) => Promise<Response>
  extract?: (
    response: Response,
  ) => Promise<{ content: string; meta?: Meta | undefined }>
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
        fetch(
          input: RequestInfo | URL,
          init: RequestInit | undefined,
          context: FetchContext,
        ) {
          return configFetch(input, init, {
            ...context,
            options: options as options,
          })
        },
      }),
    }
  }
  return Object.assign(factory, { key: config.key })
}

export namespace defineRule {
  export type Config<options = void> = { key: string } & Omit<Rule, 'fetch'> & {
      fetch?: (
        input: RequestInfo | URL,
        init: RequestInit | undefined,
        context: FetchContext & { options: options },
      ) => Promise<Response>
    }

  export type ReturnType<options = void> = ((options?: options) => Rule) & {
    key: string
  }
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
type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [key: string]: YamlValue }

const metaKeyPriority: Record<string, number> = {
  title: 0,
  description: 1,
  url: 2,
  site: 3,
  author: 4,
  publish_date: 5,
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

function normalizeMarkdown(content: string): string {
  return (
    content
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
      // Normalize GFM table separator rows to use `| --- |`
      .replace(/^(\| *:?)-+([ :]*\|(?:[ :]*-+[ :]*\|)*)\s*$/gm, (match) =>
        match.replace(/\| *(:?)-+(:?) */g, '| $1---$2 '),
      )
  )
}
