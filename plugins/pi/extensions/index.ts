import child_process from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { createClient, defaultBaseUrl } from 'curl.md'

export default function (pi: ExtensionAPI) {
  const authState = createAuthState()

  pi.registerCommand('curlmd_status', {
    description: 'Show curl.md Pi extension status and setup guidance.',
    async handler(_args, ctx) {
      const auth = await resolveAuth(authState)
      const baseUrl = process.env.CURLMD_BASE_URL || defaultBaseUrl
      const cliInstalled = resolveCliRuntime(authState) !== null
      const lines = [
        'curl.md Pi',
        `Tool: curlmd_fetch`,
        `CLI: ${cliInstalled ? 'installed' : 'not found'}`,
      ]

      if (baseUrl !== defaultBaseUrl) lines.push(`Base URL: ${baseUrl}`)

      if (auth.type === 'anonymous') {
        lines.push('Auth: anonymous')
        lines.push('Next: set CURLMD_API_KEY or run `curl.md auth login`.')
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
        if (auth.type === 'cli') clearCliAuthCache(authState)
        lines.push(`Auth: ${auth.type} (not authenticated)`)
        lines.push(
          auth.type === 'api_key'
            ? 'Next: refresh CURLMD_API_KEY.'
            : 'Next: run `curl.md auth login` or set CURLMD_API_KEY.',
        )
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
      const baseUrl = process.env.CURLMD_BASE_URL || defaultBaseUrl
      let auth = await resolveAuth(authState, signal)
      const url = normalizeUrl(params.url)

      const client = createClient(baseUrl, {
        headers: createHeaders(auth),
      })
      let res = await client.fetch(url, {
        fresh: params.fresh,
        keywords: params.keywords,
        mode: params.mode,
        objective: params.objective,
        options: { init: { signal } },
      })

      if (res.status === 401 && auth.type === 'cli') {
        clearCliAuthCache(authState)
        auth = await resolveAuth(authState, signal)
        if (auth.type === 'anonymous') {
          const client = createClient(baseUrl, {
            headers: createHeaders(auth),
          })
          res = await client.fetch(url, {
            fresh: params.fresh,
            keywords: params.keywords,
            mode: params.mode,
            objective: params.objective,
            options: { init: { signal } },
          })
        }
      }

      if (res.status === 400) {
        const json = await res.json()
        throw new Error(formatValidationError(json, json.message))
      }

      if (res.status === 401) {
        if (auth.type === 'api_key')
          throw new Error('curl.md authentication failed. Fix CURLMD_API_KEY.')
        if (auth.type === 'cli')
          throw new Error('curl.md authentication failed. Run `curl.md auth login` again.')

        throw new Error(
          'curl.md authentication required. Set CURLMD_API_KEY or run `curl.md auth login`.',
        )
      }

      if (res.status === 403) {
        const json = await res.json()
        if (auth.type === 'api_key')
          throw new Error(`${json.message}. Check CURLMD_API_KEY access.`)

        throw new Error(
          `${json.message}. Set CURLMD_API_KEY or adjust your curl.md account access.`,
        )
      }

      if (res.status === 429) {
        const json = await res.json()
        const retryAfter = res.headers.get('retry-after')
        const message = retryAfter ? `${json.message}. Try again in ${retryAfter}s` : json.message

        if (auth.type === 'anonymous')
          throw new Error(
            `${message}. Set CURLMD_API_KEY or run \`curl.md auth login\` for higher limits.`,
          )

        throw new Error(`${message}. Add credits with \`curl.md credits add\` if needed.`)
      }

      if (!res.ok) {
        const json = await readJson(res.clone())
        const error = parseApiError(json)
        if (error) throw new Error(`curl.md request failed: ${error.message}`)

        const text = await res.text()
        throw new Error(text || `curl.md request failed with status ${res.status}`)
      }

      const json = (await res.json()) as { content: string }

      return {
        content: [{ type: 'text', text: json.content }],
        details: {
          auth: auth.type,
          cache: toTextHeader(res.headers.get('x-cache')),
          credits_remaining: toNumberHeader(res.headers.get('x-credits-remaining')),
          request_id: toTextHeader(res.headers.get('x-request-id')),
          tokens_count: toNumberHeader(res.headers.get('x-tokens-count')),
          tokens_saved: toNumberHeader(res.headers.get('x-tokens-saved')),
          url,
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

function createAuthState() {
  return {
    cliAuthCache: null as null | { auth: CliAuth | null; stale_at: number },
    cliRuntime: undefined as CliRuntime | null | undefined,
  }
}

function createHeaders(
  auth: ResolvedAuth | { authorization?: string; organization_id?: string | null | undefined },
) {
  const headers: Record<string, string> = {
    accept: 'application/json',
  }
  const authorization = 'authorization' in auth ? auth.authorization : undefined
  const organizationId = 'organization_id' in auth ? auth.organization_id : undefined
  if (authorization) headers.authorization = authorization
  if (organizationId) headers['x-organization-id'] = organizationId
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

async function resolveAuth(
  state: ReturnType<typeof createAuthState>,
  signal?: AbortSignal,
): Promise<ResolvedAuth> {
  if (process.env.CURLMD_API_KEY)
    return {
      authorization: `Bearer ${process.env.CURLMD_API_KEY}`,
      type: 'api_key' as const,
    }

  const cliAuth = await readCliAuth(state, signal)
  if (cliAuth)
    return {
      ...cliAuth,
      type: 'cli' as const,
    }

  return {
    type: 'anonymous' as const,
  }
}

async function readCliAuth(state: ReturnType<typeof createAuthState>, signal?: AbortSignal) {
  const now = Date.now()
  if (state.cliAuthCache && state.cliAuthCache.stale_at > now) return state.cliAuthCache.auth

  const cliRuntime = resolveCliRuntime(state)
  if (!cliRuntime) {
    state.cliAuthCache = { auth: null, stale_at: now + 60_000 }
    return null
  }

  try {
    const { stdout } = await execFile(
      cliRuntime.command,
      [...cliRuntime.args, 'auth', 'headers', '--json'],
      { signal },
    )
    const json = JSON.parse(stdout.trim()) as { data?: unknown }
    const data = json.data ?? json
    if (!isCliAuth(data)) throw new Error('Invalid auth response')
    state.cliAuthCache = {
      auth: data,
      stale_at: getCliAuthCacheExpiry(data),
    }
    return data
  } catch {
    state.cliAuthCache = { auth: null, stale_at: now + 60_000 }
    return null
  }
}

function resolveCliRuntime(state: ReturnType<typeof createAuthState>) {
  if (state.cliRuntime !== undefined) return state.cliRuntime

  try {
    const entryPath = fileURLToPath(import.meta.resolve('curl.md'))
    for (let dir = path.dirname(entryPath); ; dir = path.dirname(dir)) {
      const distBin = path.join(dir, 'dist', 'bin.js')
      if (fs.existsSync(distBin)) {
        state.cliRuntime = { command: process.execPath, args: [distBin] }
        return state.cliRuntime
      }

      const srcBin = path.join(dir, 'src', 'bin.ts')
      if (fs.existsSync(srcBin)) {
        state.cliRuntime = {
          command: process.execPath,
          args: ['--experimental-strip-types', srcBin],
        }
        return state.cliRuntime
      }

      const parent = path.dirname(dir)
      if (parent === dir) break
    }
  } catch {}

  state.cliRuntime = null
  return state.cliRuntime
}

function clearCliAuthCache(state: ReturnType<typeof createAuthState>) {
  state.cliAuthCache = null
}

function getCliAuthCacheExpiry(auth: CliAuth) {
  if (!auth.expires_at) return Date.now() + 60_000

  const expiresAt = Date.parse(auth.expires_at)
  if (!Number.isFinite(expiresAt)) return Date.now() + 60_000
  return Math.max(Date.now(), expiresAt - 60_000)
}

function isCliAuth(value: unknown): value is CliAuth {
  return (
    typeof value === 'object' &&
    value !== null &&
    'authorization' in value &&
    typeof value.authorization === 'string' &&
    'expires_at' in value &&
    (value.expires_at === null || typeof value.expires_at === 'string') &&
    'organization_id' in value &&
    (value.organization_id === null || typeof value.organization_id === 'string')
  )
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

function normalizeUrl(url: string) {
  return url.includes('://') ? url : `https://${url}`
}

async function execFile(command: string, args: string[], options: { signal?: AbortSignal } = {}) {
  return await new Promise<{ stderr: string; stdout: string }>((resolve, reject) => {
    child_process.execFile(
      command,
      args,
      {
        encoding: 'utf8',
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
        signal: options.signal,
      },
      (error, stdout, stderr) => {
        if (error) {
          Object.assign(error, { stderr, stdout })
          reject(error)
          return
        }

        resolve({ stderr, stdout })
      },
    )
  })
}

type CliAuth = {
  authorization: string
  expires_at: string | null
  organization_id: string | null
}

type CliRuntime = {
  args: string[]
  command: string
}

type ResolvedAuth =
  | { type: 'anonymous' }
  | { authorization: string; type: 'api_key' }
  | ({ type: 'cli' } & CliAuth)
