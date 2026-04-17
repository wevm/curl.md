import { type Plugin, tool } from '@opencode-ai/plugin'
import { createClient, defaultBaseUrl } from 'curl.md'
import { Auth, Session } from 'curl.md/internal'

export const server: Plugin = async () => {
  const baseUrl = process.env.CURLMD_BASE_URL || defaultBaseUrl
  const apiKey = process.env.CURLMD_API_KEY
  const resolver = Auth.createResolver(baseUrl, apiKey)

  return {
    'tool.definition': async (input, output) => {
      if (input.toolID !== 'webfetch') return
      output.description =
        'Deprecated in this project. Use curlmd instead because it fetches pages through curl.md and returns lower-token markdown optimized for coding agents.'
    },
    tool: {
      curlmd: tool({
        description:
          'Fetch a web page through curl.md and return markdown optimized for coding agents.',
        args: {
          url: tool.schema
            .string()
            .describe(
              'HTTP(S) URL or bare domain to fetch via curl.md. Prefer the canonical docs or article URL you want summarized.',
            ),
        },
        async execute(args, ctx) {
          const result = await fetchPage({
            baseUrl,
            resolver,
            url: args.url,
          })

          ctx.metadata({
            title: `curlmd ${result.url}`,
            metadata: {
              auth: result.auth,
              cache: result.cache,
              url: result.url,
            },
          })

          return result.markdown
        },
      }),
    },
  }
}

async function fetchPage(input: {
  baseUrl: string
  fresh?: boolean
  keywords?: string[]
  mode?: 'rush' | 'smart'
  objective?: string
  resolver: () => Promise<Auth.Headers | null>
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
  let res = await client.fetch(url, { ...fetchParams, token: apiKey })

  if (res.status === 401 && authType === 'session') {
    authHeaders = await input.resolver()
    if (!authHeaders) authType = 'anon'
    const retryClient = createClient(input.baseUrl, {
      headers: apiKey ? createHeaders(null) : createHeaders(authHeaders),
    })
    res = await retryClient.fetch(url, { ...fetchParams, token: apiKey })
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
    if (error) throw new Error(formatApiError(error))

    const text = await res.text()
    throw new Error(text || `curl.md request failed with status ${res.status}`)
  }

  const json = await res.json()
  return {
    auth: authType,
    cache: res.headers.get('x-cache') || undefined,
    markdown: json.content.replace(/\n\n---\n\nPowered by \[curl\.md\]\(https:\/\/curl\.md\)$/, ''),
    url,
  }
}

function createHeaders(auth: Auth.Headers | null) {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (auth?.authorization) headers.authorization = auth.authorization
  if (auth?.organization_id) headers['x-organization-id'] = auth.organization_id
  return headers
}

function formatApiError(error: { code: string; message: string }) {
  return `(${error.code}) ${error.message}`
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
