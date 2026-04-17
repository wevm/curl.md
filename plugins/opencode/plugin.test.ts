import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Plugin } from '@opencode-ai/plugin'
import { defaultBaseUrl } from 'curl.md'
import { Session } from 'curl.md/internal'
import { HttpResponse, http, passthrough } from 'msw'
import { setupServer } from 'msw/node'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { plugin } from './plugin.ts'

const server = setupServer()

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  return () => server.close()
})

beforeEach((context) => {
  const xdgDataHome = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-opencode-test-'))
  vi.stubEnv('XDG_DATA_HOME', xdgDataHome)
  context.onTestFinished(() => {
    fs.rmSync(xdgDataHome, { force: true, recursive: true })
  })
})

afterEach(() => {
  server.resetHandlers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

test('registers curl_md by default', async () => {
  const hooks = await loadPlugin()

  expect(Object.keys(hooks.tool || {})).toEqual(['curl_md', 'webfetch'])
})

test('can disable webfetch override with plugin options', async () => {
  const hooks = await loadPlugin({ webfetch: false })

  expect(Object.keys(hooks.tool || {})).toEqual(['curl_md'])
})

test('returns markdown and tool metadata for curl_md by default', async () => {
  const requests: CapturedRequest[] = []

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json(
        { content: '# Example\n\n---\n\nPowered by [curl.md](https://curl.md)' },
        {
          headers: {
            'x-cache': 'HIT',
            'x-request-id': 'req_123',
            'x-tokens-saved': '128',
          },
        },
      )
    }),
  )

  const hooks = await loadPlugin()
  const metadata = vi.fn()
  const result = await hooks.tool!.curl_md.execute(
    {
      options: {
        format: 'markdown',
        fresh: true,
        keywords: ['plugin'],
        mode: 'smart',
        objective: 'Summarize the docs',
        timeout: 30,
      },
      url: 'https://example.com',
    },
    createToolContext(metadata),
  )

  expect(requests[0]?.url).toContain(`${defaultBaseUrl}/api/https://example.com/`)
  expect(requests[0]?.url).toContain('fresh=')
  expect(requests[0]?.url).toContain('keywords=plugin')
  expect(requests[0]?.url).toContain('mode=smart')
  expect(requests[0]?.url).toContain('objective=Summarize+the+docs')
  expect(result).toEqual({
    metadata: {
      auth: 'anon',
      cache: 'HIT',
      fresh: true,
      request_id: 'req_123',
      tokens_saved: 128,
      url: 'https://example.com/',
    },
    output: '# Example',
    title: 'https://example.com/',
  })
  expect(metadata).toHaveBeenCalledWith({
    metadata: {
      auth: 'anon',
      cache: 'HIT',
      fresh: true,
      request_id: 'req_123',
      tokens_saved: 128,
      url: 'https://example.com/',
    },
    title: 'https://example.com/',
  })
})

test('returns markdown and tool metadata for webfetch when enabled', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json(
        { content: '# Example\n\n---\n\nPowered by [curl.md](https://curl.md)' },
        {
          headers: {
            'x-cache': 'HIT',
            'x-request-id': 'req_456',
            'x-tokens-saved': '64',
          },
        },
      )
    }),
  )

  const hooks = await loadPlugin({ webfetch: true })
  const metadata = vi.fn()
  const result = await hooks.tool!.webfetch.execute(
    {
      options: {
        format: 'markdown',
        fresh: true,
        keywords: ['plugin'],
        mode: 'smart',
        objective: 'Summarize the docs',
        timeout: 30,
      },
      url: 'https://example.com',
    },
    createToolContext(metadata),
  )

  expect(result).toEqual({
    metadata: {
      auth: 'anon',
      cache: 'HIT',
      fresh: true,
      request_id: 'req_456',
      tokens_saved: 64,
      url: 'https://example.com/',
    },
    output: '# Example',
    title: 'https://example.com/',
  })
  expect(metadata).toHaveBeenCalledWith({
    metadata: {
      auth: 'anon',
      cache: 'HIT',
      fresh: true,
      request_id: 'req_456',
      tokens_saved: 64,
      url: 'https://example.com/',
    },
    title: 'https://example.com/',
  })
})

test('accepts legacy top-level webfetch args and prefers nested options', async () => {
  const requests: CapturedRequest[] = []

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json({ content: '# Example' })
    }),
  )

  const hooks = await loadPlugin({ webfetch: true })
  await hooks.tool!.webfetch.execute(
    {
      fresh: false,
      keywords: ['legacy'],
      mode: 'rush',
      objective: 'Legacy objective',
      options: {
        fresh: true,
        keywords: ['nested'],
        mode: 'smart',
        objective: 'Nested objective',
      },
      url: 'https://example.com',
    },
    createToolContext(vi.fn()),
  )

  expect(requests[0]?.url).toContain('fresh=')
  expect(requests[0]?.url).toContain('keywords=nested')
  expect(requests[0]?.url).toContain('mode=smart')
  expect(requests[0]?.url).toContain('objective=Nested+objective')
  expect(requests[0]?.url).not.toContain('keywords=legacy')
  expect(requests[0]?.url).not.toContain('mode=rush')
  expect(requests[0]?.url).not.toContain('objective=Legacy+objective')
})

test('rejects non-http(s) URLs', async () => {
  const hooks = await loadPlugin()

  await expect(
    hooks.tool!.curl_md.execute({ url: 'ftp://example.com' }, createToolContext(vi.fn())),
  ).rejects.toThrow('URL must use http or https')
})

test('retries once on session 401 with forced auth refresh', async () => {
  const requests: CapturedRequest[] = []
  let fetchCount = 0
  let headersCount = 0

  server.use(
    http.post('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin || url.pathname !== '/api/auth/headers')
        return passthrough()
      headersCount++
      return HttpResponse.json({
        authorization: `Bearer access-token-${headersCount}`,
        expires_at: '2099-01-01T00:00:00.000Z',
      })
    }),
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      fetchCount++
      requests.push(captureRequest(request))
      if (fetchCount === 1) return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
      return HttpResponse.json({ content: '# Retried' })
    }),
  )

  Session.write(
    {
      refresh_token: 'rt_test',
      refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
    },
    defaultBaseUrl,
  )

  const hooks = await loadPlugin()
  const result = await hooks.tool!.curl_md.execute(
    { url: 'https://example.com' },
    createToolContext(vi.fn()),
  )

  expect(headersCount).toBe(2)
  expect(fetchCount).toBe(2)
  expect(requests[0]?.headers.authorization).toBe('Bearer access-token-1')
  expect(requests[1]?.headers.authorization).toBe('Bearer access-token-2')
  expect(result).toEqual({
    metadata: {
      auth: 'session',
      cache: undefined,
      fresh: undefined,
      request_id: undefined,
      tokens_saved: undefined,
      url: 'https://example.com/',
    },
    output: '# Retried',
    title: 'https://example.com/',
  })
})

test('clears session org on 403', async () => {
  server.use(
    http.post('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin || url.pathname !== '/api/auth/headers')
        return passthrough()
      return HttpResponse.json({
        authorization: 'Bearer access-token-1',
        expires_at: '2099-01-01T00:00:00.000Z',
      })
    }),
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json({ message: 'Organization access denied' }, { status: 403 })
    }),
  )

  Session.write(
    {
      organization_id: 'org_bad',
      refresh_token: 'rt_test',
      refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
    },
    defaultBaseUrl,
  )

  const hooks = await loadPlugin()
  await expect(
    hooks.tool!.curl_md.execute({ url: 'https://example.com' }, createToolContext(vi.fn())),
  ).rejects.toThrow('Organization access denied. Set CURLMD_API_KEY or run `curl.md auth login`.')

  expect(Session.read(defaultBaseUrl)?.organization_id).toBeUndefined()
})

test('surfaces anon rate limit guidance for 429', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json(
        { code: 'rate_limit_exceeded', message: 'Rate limit exceeded' },
        { headers: { 'retry-after': '12' }, status: 429 },
      )
    }),
  )

  const hooks = await loadPlugin()
  await expect(
    hooks.tool!.curl_md.execute({ url: 'https://example.com' }, createToolContext(vi.fn())),
  ).rejects.toThrow(
    'Rate limit exceeded. Try again in 12s. Set CURLMD_API_KEY or run `curl.md auth login` for higher limits.',
  )
})

test('surfaces authenticated rate limit guidance for 429', async () => {
  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json(
        { code: 'rate_limit_exceeded', message: 'Rate limit exceeded' },
        { headers: { 'retry-after': '5' }, status: 429 },
      )
    }),
  )

  const hooks = await loadPlugin()
  await expect(
    hooks.tool!.curl_md.execute({ url: 'https://example.com' }, createToolContext(vi.fn())),
  ).rejects.toThrow(
    'Rate limit exceeded. Try again in 5s. Add credits with `curl.md credits add` if needed.',
  )
})

test('surfaces API error codes for non-ok responses', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json({ code: 'ai_failed', message: 'error code: 1031' }, { status: 500 })
    }),
  )

  const hooks = await loadPlugin()
  await expect(
    hooks.tool!.curl_md.execute({ url: 'https://example.com' }, createToolContext(vi.fn())),
  ).rejects.toThrow('(AI_FAILED) error code: 1031')
})

test('uses CURLMD_API_KEY when provided', async () => {
  const requests: CapturedRequest[] = []

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json({ content: '# Auth' })
    }),
  )
  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')

  const hooks = await loadPlugin({ webfetch: true })
  await hooks.tool!.webfetch.execute({ url: 'https://example.com' }, createToolContext(vi.fn()))

  expect(requests[0]?.headers).toEqual({
    accept: 'application/json',
    authorization: 'Bearer curlmd_test_token',
  })
})

test('surfaces authentication guidance for anonymous 401s', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }),
  )

  const hooks = await loadPlugin({ webfetch: true })
  await expect(
    hooks.tool!.webfetch.execute({ url: 'https://example.com' }, createToolContext(vi.fn())),
  ).rejects.toThrow(
    'curl.md authentication required. Set CURLMD_API_KEY or run `curl.md auth login`.',
  )
})

test('surfaces authentication guidance for invalid API key 401s', async () => {
  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json(
        { code: 'invalid_api_key', message: 'Invalid API key' },
        { status: 401 },
      )
    }),
  )

  const hooks = await loadPlugin({ webfetch: true })
  await expect(
    hooks.tool!.webfetch.execute({ url: 'https://example.com' }, createToolContext(vi.fn())),
  ).rejects.toThrow('curl.md authentication failed. Fix CURLMD_API_KEY.')
})

async function loadPlugin(options?: Record<string, unknown>) {
  return plugin(
    {
      $: undefined as never,
      client: undefined as never,
      directory: process.cwd(),
      experimental_workspace: { register() {} },
      project: { id: 'test', time: { created: Date.now() }, worktree: process.cwd() },
      serverUrl: new URL('http://127.0.0.1:4096'),
      worktree: process.cwd(),
    } as Parameters<Plugin>[0],
    options,
  )
}

function captureRequest(request: Request): CapturedRequest {
  return {
    headers: Object.fromEntries(request.headers.entries()),
    method: request.method,
    url: request.url,
  }
}

function createToolContext(
  metadata: (input: { metadata?: Record<string, unknown>; title?: string }) => void,
) {
  return {
    abort: new AbortController().signal,
    agent: 'test',
    ask: undefined as never,
    directory: process.cwd(),
    messageID: 'message_1',
    metadata,
    sessionID: 'session_1',
    worktree: process.cwd(),
  }
}

type CapturedRequest = {
  headers: Record<string, string>
  method: string
  url: string
}
