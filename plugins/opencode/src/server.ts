import * as opencodePlugin from '@opencode-ai/plugin'
import * as curlmd from 'curl.md'
import * as curlmdInternal from 'curl.md/internal'
import { createHeaders, formatApiError, parseApiError } from './utils.ts'

const aiAgent = 'opencode' as const

export const plugin: opencodePlugin.Plugin = async (_input, options) => {
  const baseUrl = process.env.CURLMD_BASE_URL || curlmd.defaultBaseUrl
  const apiKey = process.env.CURLMD_API_KEY
  const resolver = curlmdInternal.Auth.createResolver(baseUrl, apiKey)
  const webfetch = typeof options?.webfetch === 'boolean' ? options.webfetch : true

  return {
    tool: {
      curl_md: createFetchTool({ baseUrl, resolver, toolName: 'curl_md' }),
      ...(webfetch
        ? { webfetch: createFetchTool({ baseUrl, resolver, toolName: 'webfetch' }) }
        : {}),
    },
  }
}

function createFetchTool(input: {
  baseUrl: string
  resolver: (
    options?: curlmdInternal.Auth.ResolveOptions,
  ) => Promise<curlmdInternal.Auth.Headers | null>
  toolName: 'curl_md' | 'webfetch'
}) {
  const optionArgs = {
    format: opencodePlugin.tool.schema
      .enum(['html', 'markdown', 'text'])
      .optional()
      .describe('Compatibility option for built-in webfetch calls. Output is always markdown.'),
    fresh: opencodePlugin.tool.schema.boolean().optional().describe('Bypass cache and fetch live.'),
    keywords: opencodePlugin.tool.schema
      .array(opencodePlugin.tool.schema.string())
      .optional()
      .describe('Keywords to focus extraction on relevant sections.'),
    mode: opencodePlugin.tool.schema
      .enum(['rush', 'smart'])
      .optional()
      .describe('rush: faster. smart: better section selection on long or noisy pages.'),
    objective: opencodePlugin.tool.schema
      .string()
      .optional()
      .describe('Specific question to answer from the page. Use when only part matters.'),
    timeout: opencodePlugin.tool.schema
      .number()
      .optional()
      .describe(
        'Compatibility option for built-in webfetch calls. Fetch timing is managed internally.',
      ),
  }
  type FetchToolArgs = FetchOptionArgs & {
    options?: FetchOptionArgs
    url: string
  }
  type FetchOptionArgs = InferSchemaArgs<typeof optionArgs>
  type InferSchemaArgs<type extends Record<string, { _output: unknown }>> = {
    [key in keyof type]?: type[key]['_output']
  }

  return opencodePlugin.tool({
    description:
      input.toolName === 'webfetch'
        ? 'Overrides built-in webfetch with markdown output.'
        : 'Fetch a URL as markdown.',
    args: {
      ...(input.toolName === 'webfetch' ? optionArgs : {}),
      options: opencodePlugin.tool.schema
        .object(optionArgs)
        .optional()
        .describe('Optional fetch settings.'),
      url: opencodePlugin.tool.schema
        .string()
        .describe('HTTP(S) URL or bare domain to fetch. Prefer the canonical docs or article URL.'),
    },
    async execute(args, ctx) {
      const toolArgs = args as FetchToolArgs
      const fetchOptions = {
        fresh: toolArgs.options?.fresh,
        keywords: toolArgs.options?.keywords,
        mode: toolArgs.options?.mode,
        objective: toolArgs.options?.objective,
        ...(input.toolName === 'webfetch'
          ? {
              fresh: toolArgs.options?.fresh ?? toolArgs.fresh,
              keywords: toolArgs.options?.keywords ?? toolArgs.keywords,
              mode: toolArgs.options?.mode ?? toolArgs.mode,
              objective: toolArgs.options?.objective ?? toolArgs.objective,
            }
          : {}),
      } satisfies FetchOptionArgs

      const result = await fetchPage({
        baseUrl: input.baseUrl,
        fresh: fetchOptions.fresh,
        keywords: fetchOptions.keywords,
        mode: fetchOptions.mode,
        objective: fetchOptions.objective,
        resolver: input.resolver,
        signal: ctx.abort,
        url: toolArgs.url,
      })

      const metadata = {
        auth: result.auth,
        cache: result.cache,
        fresh: result.fresh,
        request_id: result.request_id,
        tokens_saved: result.tokens_saved,
        url: result.url,
      }

      try {
        ctx.metadata({
          title: result.url,
          metadata,
        })
      } catch {}

      return result.markdown
    },
  })
}

async function fetchPage(input: {
  baseUrl: string
  fresh?: boolean
  keywords?: string[]
  mode?: 'rush' | 'smart'
  objective?: string
  resolver: (
    options?: curlmdInternal.Auth.ResolveOptions,
  ) => Promise<curlmdInternal.Auth.Headers | null>
  signal?: AbortSignal
  url: string
}) {
  const url = normalizeURL(input.url)

  let authHeaders = await input.resolver()
  let authType: 'anon' | 'api_key' | 'session' = (() => {
    if (process.env.CURLMD_API_KEY) return 'api_key'
    if (authHeaders) return 'session'
    return 'anon'
  })()

  const fetchParams = {
    fresh: input.fresh,
    keywords: input.keywords,
    mode: input.mode,
    objective: input.objective,
  }

  const apiKey = process.env.CURLMD_API_KEY
  const client = curlmd.createClient(input.baseUrl, {
    aiAgent,
    headers: apiKey ? createHeaders(null) : createHeaders(authHeaders),
  })
  let res = await client.fetch(url, {
    ...fetchParams,
    options: { init: { signal: input.signal } },
    token: apiKey,
  })

  if (res.status === 401 && authType === 'session') {
    authHeaders = await input.resolver({ forceRefresh: true })
    if (!authHeaders) authType = 'anon'
    const retryClient = curlmd.createClient(input.baseUrl, {
      aiAgent,
      headers: apiKey ? createHeaders(null) : createHeaders(authHeaders),
    })
    res = await retryClient.fetch(url, {
      ...fetchParams,
      options: { init: { signal: input.signal } },
      token: apiKey,
    })
  }

  if (res.status === 400) {
    const json = await res.json()
    const errorMessage = (() => {
      if (
        typeof json !== 'object' ||
        json === null ||
        !('issues' in json) ||
        !Array.isArray(json.issues)
      )
        return (json as { message?: string }).message || 'Bad request'

      return json.issues
        .map((issue: { path: string; message: string }) => `${issue.path}: ${issue.message}`)
        .join('\n')
    })()
    throw new Error(errorMessage)
  }

  if (res.status === 401) {
    if (authType === 'api_key')
      throw new Error('curl.md authentication failed. Fix CURLMD_API_KEY.')
    if (authType === 'session')
      throw new Error('curl.md authentication failed. Run `curl.md auth login` again.')
    throw new Error(
      'curl.md authentication required. Set CURLMD_API_KEY or run `curl.md auth login`.',
    )
  }

  if (res.status === 403) {
    const json = await res.json()
    curlmdInternal.Session.write({ organization_id: undefined }, input.baseUrl)
    if (authType === 'api_key') throw new Error(`${json.message}. Check CURLMD_API_KEY access.`)
    throw new Error(`${json.message}. Set CURLMD_API_KEY or run \`curl.md auth login\`.`)
  }

  if (res.status === 429) {
    const json = await res.json()
    const retryAfter = res.headers.get('retry-after')
    const message = retryAfter ? `${json.message}. Try again in ${retryAfter}s` : json.message

    if (authType === 'anon')
      throw new Error(
        `${message}. Set CURLMD_API_KEY or run \`curl.md auth login\` for higher limits.`,
      )

    throw new Error(`${message}. Add credits with \`curl.md credits add\` if needed.`)
  }

  if (!res.ok) {
    const json = await res
      .clone()
      .json()
      .catch(() => undefined)
    const error = parseApiError(json)
    if (error) throw new Error(formatApiError(error))

    const text = await res.text()
    throw new Error(text || `curl.md request failed with status ${res.status}`)
  }

  const json = await res.json()
  return {
    auth: authType,
    cache: res.headers.get('x-cache') || undefined,
    fresh: input.fresh || undefined,
    markdown: json.content,
    request_id: res.headers.get('x-request-id') || undefined,
    tokens_saved: parseNumberHeader(res.headers.get('x-tokens-saved')),
    url,
  }
}

function normalizeURL(value: string) {
  const url = new URL(value.includes('://') ? value : `https://${value}`)
  if (!/^https?:$/.test(url.protocol)) throw new Error('URL must use http or https')
  return url.toString()
}

function parseNumberHeader(value: string | null) {
  if (!value) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}
