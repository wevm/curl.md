import { type Plugin, tool } from '@opencode-ai/plugin'
import { createClient, defaultBaseUrl } from 'curl.md'
import { Auth, Session } from 'curl.md/internal'

export const plugin: Plugin = async (_input, options) => {
  const baseUrl = process.env.CURLMD_BASE_URL || defaultBaseUrl
  const apiKey = process.env.CURLMD_API_KEY
  const resolver = Auth.createResolver(baseUrl, apiKey)
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
  resolver: (options?: Auth.ResolveOptions) => Promise<Auth.Headers | null>
  toolName: 'curl_md' | 'webfetch'
}) {
  const optionArgs = {
    format: tool.schema
      .enum(['html', 'markdown', 'text'])
      .optional()
      .describe(
        'Compatibility option for OpenCode built-in webfetch calls. curl.md always returns markdown.',
      ),
    fresh: tool.schema
      .boolean()
      .optional()
      .describe('Bypass the curl.md cache and fetch the page live.'),
    keywords: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe('Optional keywords to focus extraction on specific sections of the page.'),
    mode: tool.schema
      .enum(['rush', 'smart'])
      .optional()
      .describe('Extraction mode. Use smart for better section selection on long pages.'),
    objective: tool.schema
      .string()
      .optional()
      .describe('Optional objective describing what to extract from the page.'),
    timeout: tool.schema
      .number()
      .optional()
      .describe(
        'Compatibility option for OpenCode built-in webfetch calls. curl.md manages fetch timing internally.',
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

  return tool({
    description:
      input.toolName === 'webfetch'
        ? 'Override OpenCode built-in webfetch with curl.md markdown output.'
        : 'Fetch a web page through curl.md and return markdown optimized for coding agents.',
    args: {
      ...(input.toolName === 'webfetch' ? optionArgs : {}),
      options: tool.schema.object(optionArgs).optional().describe('Optional fetch settings.'),
      url: tool.schema
        .string()
        .describe(
          'HTTP(S) URL or bare domain to fetch via curl.md. Prefer the canonical docs or article URL you want summarized.',
        ),
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

      ctx.metadata({
        title: result.url,
        metadata,
      })

      // TODO: Drop this cast once @opencode-ai/plugin types structured tool results.
      // OpenCode accepts structured tool results, but @opencode-ai/plugin@1.4.6
      // still types plugin execute() as Promise<string>.
      return {
        metadata,
        output: result.markdown,
        title: result.url,
      } as unknown as string
    },
  })
}

async function fetchPage(input: {
  baseUrl: string
  fresh?: boolean
  keywords?: string[]
  mode?: 'rush' | 'smart'
  objective?: string
  resolver: (options?: Auth.ResolveOptions) => Promise<Auth.Headers | null>
  signal?: AbortSignal
  url: string
}) {
  const url = normalizeUrl(input.url)

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
  const client = createClient(input.baseUrl, {
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
    const retryClient = createClient(input.baseUrl, {
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
    Session.write({ organization_id: undefined }, input.baseUrl)
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
    if (error) throw new Error(`(${error.code}) ${error.message}`)

    const text = await res.text()
    throw new Error(text || `curl.md request failed with status ${res.status}`)
  }

  const json = await res.json()
  return {
    auth: authType,
    cache: res.headers.get('x-cache') || undefined,
    fresh: input.fresh || undefined,
    markdown: json.content.replace(/\n\n---\n\nPowered by \[curl\.md\]\(https:\/\/curl\.md\)$/, ''),
    request_id: res.headers.get('x-request-id') || undefined,
    tokens_saved: parseNumberHeader(res.headers.get('x-tokens-saved')),
    url,
  }
}

function createHeaders(auth: Auth.Headers | null) {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (auth?.authorization) headers.authorization = auth.authorization
  if (auth?.organization_id) headers['x-organization-id'] = auth.organization_id
  return headers
}

function normalizeUrl(value: string) {
  const url = new URL(value.includes('://') ? value : `https://${value}`)
  if (!/^https?:$/.test(url.protocol)) throw new Error('URL must use http or https')
  return url.toString()
}

function parseApiError(json: unknown) {
  if (typeof json !== 'object' || json === null) return undefined
  if (!('message' in json) || typeof json.message !== 'string') return undefined
  return {
    code:
      'code' in json && typeof json.code === 'string' ? json.code.toUpperCase() : 'REQUEST_FAILED',
    message: json.message,
  }
}

function parseNumberHeader(value: string | null) {
  if (!value) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}
