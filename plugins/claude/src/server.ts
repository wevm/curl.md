import process from 'node:process'
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server'
import { createClient, defaultBaseUrl } from 'curl.md'
import { Auth, Session } from 'curl.md/internal'
import { z } from 'zod'

const aiAgent = 'claude' as const

const baseUrl = process.env.CURLMD_BASE_URL || defaultBaseUrl
const apiKey = process.env.CURLMD_API_KEY
const resolver = Auth.createResolver(baseUrl, apiKey)

const server = new McpServer({
  name: 'curl_md',
  version: '0.0.1',
})

server.registerTool(
  'curl_md',
  {
    title: 'curl.md',
    description: 'Fetch a URL as markdown.',
    inputSchema: z.object({
      url: z
        .string()
        .describe('HTTP(S) URL or bare domain to fetch. Prefer the canonical docs or article URL.'),
      objective: z
        .string()
        .optional()
        .describe('Specific question to answer from the page. Use when only part matters.'),
      keywords: z
        .array(z.string())
        .optional()
        .describe('Keywords to focus extraction on relevant sections.'),
      mode: z
        .enum(['rush', 'smart'])
        .optional()
        .describe('rush: faster. smart: better section selection on long or noisy pages.'),
      fresh: z.boolean().optional().describe('Bypass cache when freshness matters.'),
    }),
  },
  async (input) => {
    try {
      const result = await fetchPage(input)
      return {
        content: [{ type: 'text' as const, text: result.markdown }],
      }
    } catch (error) {
      return {
        content: [
          { type: 'text' as const, text: error instanceof Error ? error.message : String(error) },
        ],
        isError: true,
      }
    }
  },
)

await server.connect(new StdioServerTransport())

async function fetchPage(input: {
  fresh?: boolean
  keywords?: string[]
  mode?: 'rush' | 'smart'
  objective?: string
  url: string
}) {
  const url = normalizeURL(input.url)

  let authHeaders = await resolver()
  let authType: 'anon' | 'api_key' | 'session' = (() => {
    if (apiKey) return 'api_key'
    if (authHeaders) return 'session'
    return 'anon'
  })()

  const client = createClient(baseUrl, {
    aiAgent,
    headers: apiKey ? createHeaders(null) : createHeaders(authHeaders),
  })
  let res = await client.fetch(url, {
    fresh: input.fresh,
    keywords: input.keywords,
    mode: input.mode,
    objective: input.objective,
    token: apiKey,
  })

  if (res.status === 401 && authType === 'session') {
    authHeaders = await resolver({ forceRefresh: true })
    if (!authHeaders) authType = 'anon'
    const retryClient = createClient(baseUrl, {
      aiAgent,
      headers: apiKey ? createHeaders(null) : createHeaders(authHeaders),
    })
    res = await retryClient.fetch(url, {
      fresh: input.fresh,
      keywords: input.keywords,
      mode: input.mode,
      objective: input.objective,
      token: apiKey,
    })
  }

  if (res.status === 400) {
    const json = await res.json()
    throw new Error(formatBadRequest(json))
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
    Session.write({ organization_id: undefined }, baseUrl)
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

  return { markdown: json.content, url }
}

function createHeaders(auth: Auth.Headers | null) {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (auth?.authorization) headers.authorization = auth.authorization
  if (auth?.organization_id) headers['x-organization-id'] = auth.organization_id
  return headers
}

function normalizeURL(value: string) {
  const url = new URL(value.includes('://') ? value : `https://${value}`)
  if (!/^https?:$/.test(url.protocol)) throw new Error('URL must use http or https')
  return url.toString()
}

function formatBadRequest(json: unknown) {
  if (typeof json !== 'object' || json === null) return 'Bad request'
  if (!('issues' in json) || !Array.isArray(json.issues))
    return 'message' in json && typeof json.message === 'string' ? json.message : 'Bad request'

  return json.issues
    .map((issue: { path: string; message: string }) => `${issue.path}: ${issue.message}`)
    .join('\n')
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

function formatApiError(error: { code: string; message: string }) {
  return `(${error.code}) ${error.message}`
}
