import child_process from 'node:child_process'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { createClient, defaultBaseUrl } from 'curl.md'

export default function (pi: ExtensionAPI) {
  pi.registerCommand('curlmd_status', {
    description: 'Show curl.md Pi extension status and setup guidance.',
    async handler(_args, ctx) {
      const auth = resolveAuth()
      const baseUrl = process.env.CURLMD_BASE_URL || defaultBaseUrl
      const cliInstalled = hasBinary('curl.md')
      const lines = [
        'curl.md Pi',
        `Tool: curlmd_fetch`,
        `CLI: ${cliInstalled ? 'installed' : 'not found'}`,
      ]

      if (baseUrl !== defaultBaseUrl) lines.push(`Base URL: ${baseUrl}`)

      if (auth.type === 'anonymous') {
        lines.push('Auth: anonymous')
        lines.push('Next: set CURLMD_API_KEY for authenticated requests.')
        ctx.ui.notify(lines.join('\n'), 'info')
        return
      }

      const status = await fetchAuthStatus({
        authorization: auth.authorization,
        baseUrl,
      })
      if (status.type === 'authenticated') {
        lines.push(`Auth: ${auth.type} (${status.login})`)
        ctx.ui.notify(lines.join('\n'), 'info')
        return
      }

      if (status.type === 'unauthenticated') {
        lines.push(`Auth: ${auth.type} (not authenticated)`)
        lines.push('Next: refresh CURLMD_API_KEY.')
        ctx.ui.notify(lines.join('\n'), 'info')
        return
      }

      lines.push(`Auth: ${auth.type} (unable to verify: ${status.message})`)
      ctx.ui.notify(lines.join('\n'), 'info')
    },
  })

  pi.registerTool({
    description: 'Fetch a URL through curl.md and return markdown optimized for coding agents.',
    label: 'curl.md Fetch',
    name: 'curlmd_fetch',
    parameters: Type.Object({
      fresh: Type.Optional(Type.Boolean({ description: 'Bypass curl.md cache' })),
      keywords: Type.Optional(
        Type.Array(Type.String({ description: 'Keyword to pre-filter sections by' })),
      ),
      mode: Type.Optional(
        Type.Union([
          Type.Literal('rush', { description: 'Lower-latency narrowing mode' }),
          Type.Literal('smart', { description: 'Higher-quality narrowing mode' }),
        ]),
      ),
      objective: Type.Optional(
        Type.String({ description: 'Specific question or objective to narrow the page to' }),
      ),
      url: Type.String({ description: 'HTTP(S) URL or bare domain to fetch via curl.md' }),
    }),
    promptGuidelines: [
      'Use curlmd_fetch for documentation pages, articles, and other web URLs when you want markdown or objective-based narrowing.',
    ],
    promptSnippet:
      'Fetch a URL via curl.md, optionally filtered by keywords or narrowed to a specific objective.',
    async execute(_toolCallId, params, signal) {
      const auth = resolveAuth()
      const baseUrl = process.env.CURLMD_BASE_URL || defaultBaseUrl
      const headers = createHeaders(auth)
      const request = {
        param: { url: params.url },
        query: {
          fresh: params.fresh ? '' : undefined,
          keywords: params.keywords?.join(','),
          mode: params.mode,
          objective: params.objective,
        },
      }

      const client = createClient(baseUrl, { headers })
      const response = await client.api[':url{.+}'].$get(request, {
        init: { signal },
      })

      if (response.status === 400) {
        const json = await response.json()
        throw new Error(formatValidationError(json, json.message))
      }

      if (response.status === 401) {
        if (auth.type === 'api_key')
          throw new Error('curl.md authentication failed. Fix CURLMD_API_KEY.')

        throw new Error('curl.md authentication required. Set CURLMD_API_KEY.')
      }

      if (response.status === 403) {
        const json = await response.json()
        if (auth.type === 'api_key')
          throw new Error(`${json.message}. Check CURLMD_API_KEY access.`)

        throw new Error(`${json.message}. Set CURLMD_API_KEY for access.`)
      }

      if (response.status === 429) {
        const json = await response.json()
        const retryAfter = response.headers.get('retry-after')
        const message = retryAfter ? `${json.message}. Try again in ${retryAfter}s` : json.message

        if (auth.type === 'anonymous')
          throw new Error(`${message}. Set CURLMD_API_KEY for higher limits.`)

        throw new Error(`${message}. Add credits with \`curl.md credits add\` if needed.`)
      }

      if (!response.ok) {
        const json = await readJson(response.clone())
        const error = parseApiError(json)
        if (error) throw new Error(`curl.md request failed: ${error.message}`)

        const text = await response.text()
        throw new Error(text || `curl.md request failed with status ${response.status}`)
      }

      const json = (await response.json()) as { content: string }

      return {
        content: [{ type: 'text', text: json.content }],
        details: {
          auth: auth.type,
          cache: toTextHeader(response.headers.get('x-cache')),
          credits_remaining: toNumberHeader(response.headers.get('x-credits-remaining')),
          request_id: toTextHeader(response.headers.get('x-request-id')),
          tokens_count: toNumberHeader(response.headers.get('x-tokens-count')),
          tokens_saved: toNumberHeader(response.headers.get('x-tokens-saved')),
          url: params.url,
        },
      }
    },
  })
}

async function fetchAuthStatus(options: { authorization?: string; baseUrl: string }) {
  if (!options.authorization) return { type: 'unauthenticated' as const }

  try {
    const client = createClient(options.baseUrl, {
      headers: createHeaders({ authorization: options.authorization }),
    })
    const res = await client.api.auth.me.$get()
    if (!res.ok) {
      const json = await readJson(res)
      const error = parseApiError(json)
      return {
        message: error?.message || `status ${res.status}`,
        type: 'error' as const,
      }
    }

    const json = await res.json()
    if (!json.account) return { type: 'unauthenticated' as const }
    return { login: json.account.login, type: 'authenticated' as const }
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'unknown error',
      type: 'error' as const,
    }
  }
}

function createHeaders(auth: { authorization?: string }) {
  const headers: Record<string, string> = {
    accept: 'application/json',
  }
  if (auth.authorization) headers.authorization = auth.authorization
  return headers
}

function parseApiError(json: unknown) {
  if (typeof json !== 'object' || json === null) return undefined
  if (!('message' in json) || typeof json.message !== 'string') return undefined
  return {
    code: 'code' in json && typeof json.code === 'string' ? json.code : 'request_failed',
    message: json.message,
  }
}

function resolveAuth() {
  if (process.env.CURLMD_API_KEY)
    return {
      authorization: `Bearer ${process.env.CURLMD_API_KEY}`,
      type: 'api_key' as const,
    }

  return {
    type: 'anonymous' as const,
  }
}

async function readJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function toNumberHeader(value: string | null) {
  if (!value) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function toTextHeader(value: string | null) {
  return value || undefined
}

function formatValidationError(json: unknown, fallback = 'Invalid request') {
  if (
    typeof json !== 'object' ||
    json === null ||
    !('issues' in json) ||
    !Array.isArray(json.issues)
  )
    return fallback

  return json.issues
    .map((issue: { message: string; path: string }) => `${issue.path}: ${issue.message}`)
    .join('\n')
}

function hasBinary(name: string) {
  try {
    child_process.execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}
