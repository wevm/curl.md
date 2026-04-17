// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
import type { PluginAPI } from '@ampcode/plugin'
import { createClient, defaultBaseUrl } from 'curl.md'
import { Auth, Session } from 'curl.md/internal'

export default function (amp: PluginAPI) {
  const baseUrl = process.env.CURLMD_BASE_URL || defaultBaseUrl
  const apiKey = process.env.CURLMD_API_KEY
  const resolver = Auth.createResolver(baseUrl, apiKey)

  amp.on('tool.call', async (event, ctx) => {
    if (event.tool !== 'read_web_page') return { action: 'allow' }
    ctx.logger.log(`curl.md intercepting read_web_page: ${String(event.input.url)}`)

    try {
      const result = await fetchPage({
        fresh: event.input.fresh as boolean | undefined,
        keywords: event.input.keywords as string[] | undefined,
        mode: event.input.mode as 'rush' | 'smart' | undefined,
        objective: event.input.objective as string | undefined,
        url: event.input.url as string,
      })
      return { action: 'synthesize', result: { output: result.markdown } }
    } catch (error) {
      return {
        action: 'reject-and-continue',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  })

  amp.registerTool({
    name: 'curl_md',
    description:
      'Read the contents of a web page at a given URL via curl.md and return markdown optimized for coding agents. Fallback for read_web_page interception.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'HTTP(S) URL or bare domain to fetch via curl.md. Prefer the canonical docs or article URL you want summarized.',
        },
        objective: {
          type: 'string',
          description:
            'Specific question or goal to answer from the page. Prefer concrete objectives like "compare pricing tiers" or "find auth header requirements".',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Keywords to pre-filter sections by. Prefer 2-5 distinct terms when only part of a long page matters.',
        },
        mode: {
          type: 'string',
          enum: ['rush', 'smart'],
          description:
            'rush: lower-latency, best when you already know the section. smart: higher-quality narrowing for long or noisy pages.',
        },
        fresh: {
          type: 'boolean',
          description:
            'Bypass curl.md cache when freshness matters, such as changelogs, release notes, or recently updated docs.',
        },
      },
      required: ['url'],
    },
    async execute(input) {
      return fetchPage({
        fresh: input.fresh as boolean | undefined,
        keywords: input.keywords as string[] | undefined,
        mode: input.mode as 'rush' | 'smart' | undefined,
        objective: input.objective as string | undefined,
        url: input.url as string,
      })
    },
  })

  async function fetchPage(input: {
    fresh?: boolean
    keywords?: string[]
    mode?: 'rush' | 'smart'
    objective?: string
    url: string
  }) {
    const url = (() => {
      const url = new URL(input.url.includes('://') ? input.url : `https://${input.url}`)
      if (!/^https?:$/.test(url.protocol)) throw new Error('URL must use http or https')
      return url.toString()
    })()

    let authHeaders = await resolver()
    let authType: 'anon' | 'api_key' | 'session' = (() => {
      if (apiKey) return 'api_key'
      if (authHeaders) return 'session'
      return 'anon'
    })()

    const fetchParams = {
      fresh: input.fresh,
      keywords: input.keywords,
      mode: input.mode,
      objective: input.objective,
    }

    const client = createClient(baseUrl, {
      headers: apiKey ? createHeaders(null) : createHeaders(authHeaders),
    })
    let res = await client.fetch(url, { ...fetchParams, token: apiKey })

    if (res.status === 401 && authType === 'session') {
      authHeaders = await resolver()
      if (!authHeaders) authType = 'anon'
      const retryClient = createClient(baseUrl, {
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
          return json.message

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
    return {
      auth: authType,
      cache: res.headers.get('x-cache') || undefined,
      credits_remaining: parseNumberHeader(res.headers.get('x-credits-remaining')),
      fresh: input.fresh || undefined,
      keywords: input.keywords,
      markdown: json.content.replace(
        /\n\n---\n\nPowered by \[curl\.md\]\(https:\/\/curl\.md\)$/,
        '',
      ),
      mode: input.mode,
      objective: input.objective,
      request_id: res.headers.get('x-request-id') || undefined,
      tokens_count: parseNumberHeader(res.headers.get('x-tokens-count')),
      tokens_saved: parseNumberHeader(res.headers.get('x-tokens-saved')),
      url,
    }
  }
}

function createHeaders(auth: Auth.Headers | null) {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (auth?.authorization) headers.authorization = auth.authorization
  if (auth?.organization_id) headers['x-organization-id'] = auth.organization_id
  return headers
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

function parseNumberHeader(value: string | null) {
  if (!value) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}
