import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultBaseUrl } from 'curl.md'
import { Session } from 'curl.md/internal'
import { HttpResponse, http, passthrough } from 'msw'
import { setupServer } from 'msw/node'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import plugin from './plugin.ts'

const server = setupServer()

let defaultXdgDataHome: string

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  return () => server.close()
})

beforeEach(() => {
  defaultXdgDataHome = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-amp-test-'))
  vi.stubEnv('XDG_DATA_HOME', defaultXdgDataHome)
})

afterEach(() => {
  server.resetHandlers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  fs.rmSync(defaultXdgDataHome, { force: true, recursive: true })
})

// --- Registration & interception ---

test('registers tool.call hook and fallback tool', () => {
  const { handlers, tools } = loadPlugin()

  expect(handlers).toHaveLength(1)
  expect(handlers[0]!.event).toBe('tool.call')
  expect(tools.map((t) => t.name)).toEqual(['curl_md'])
})

test('tool.call hook allows non-read_web_page tools', async () => {
  const { handlers } = loadPlugin()
  const handler = handlers.find((h) => h.event === 'tool.call')!

  const result = await handler.fn(
    { tool: 'Bash', toolUseID: 'call_1', input: { cmd: 'ls' } },
    {} as any,
  )

  expect(result).toEqual({ action: 'allow' })
})

test('tool.call hook intercepts read_web_page and synthesizes result', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json(
        { content: '# Example Page\n\n---\n\nPowered by [curl.md](https://curl.md)' },
        {
          headers: {
            'x-cache': 'HIT',
            'x-credits-remaining': '100',
            'x-request-id': 'req_abc',
            'x-tokens-count': '50',
            'x-tokens-saved': '200',
          },
        },
      )
    }),
  )

  const { handlers } = loadPlugin()
  const handler = handlers.find((h) => h.event === 'tool.call')!

  const result = await handler.fn(
    {
      tool: 'read_web_page',
      toolUseID: 'call_1',
      input: { url: 'https://example.com', objective: 'test', mode: 'rush' },
    },
    { logger: { log() {} } } as any,
  )

  expect(result).toEqual({
    action: 'synthesize',
    result: {
      output: '# Example Page',
    },
  })
})

test('tool.call hook returns error on failure', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }),
  )

  const { handlers } = loadPlugin()
  const handler = handlers.find((h) => h.event === 'tool.call')!

  const result = await handler.fn(
    { tool: 'read_web_page', toolUseID: 'call_1', input: { url: 'https://example.com' } },
    { logger: { log() {} } } as any,
  )

  expect(result).toMatchObject({
    action: 'reject-and-continue',
    message: 'curl.md authentication required. Set CURLMD_API_KEY or run `curl.md auth login`.',
  })
})

// --- URL normalization ---

test('normalizes bare domain to https URL', async () => {
  const requests: CapturedRequest[] = []
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json({ content: '# Hello' })
    }),
  )

  const { tools } = loadPlugin()
  await tools[0]!.execute({ url: 'example.com' }, { logger: { log() {} } } as any)

  expect(requests[0]?.url).toContain('example.com')
})

test('rejects non-http(s) URLs', async () => {
  const { tools } = loadPlugin()
  await expect(
    tools[0]!.execute({ url: 'ftp://example.com' }, { logger: { log() {} } } as any),
  ).rejects.toThrow('URL must use http or https')
})

// --- Anonymous fetch ---

test('fetches anonymously and returns expected shape', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json(
        { content: '# Example\n\n---\n\nPowered by [curl.md](https://curl.md)' },
        {
          headers: {
            'x-cache': 'HIT',
            'x-credits-remaining': '42',
            'x-request-id': 'req_abc',
            'x-tokens-count': '100',
            'x-tokens-saved': '50',
          },
        },
      )
    }),
  )

  const { tools } = loadPlugin()
  const result = await tools[0]!.execute(
    { url: 'https://example.com', objective: 'test', keywords: ['a'], mode: 'rush', fresh: true },
    { logger: { log() {} } } as any,
  )

  expect(result).toEqual({
    auth: 'anon',
    cache: 'HIT',
    credits_remaining: 42,
    fresh: true,
    keywords: ['a'],
    markdown: '# Example',
    mode: 'rush',
    objective: 'test',
    request_id: 'req_abc',
    tokens_count: 100,
    tokens_saved: 50,
    url: 'https://example.com/',
  })
})

// --- API key auth ---

test('prefers CURLMD_API_KEY for authentication', async () => {
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

  const { tools } = loadPlugin()
  await tools[0]!.execute({ url: 'https://example.com' }, { logger: { log() {} } } as any)

  expect(requests[0]?.headers).toEqual({
    accept: 'application/json',
    authorization: 'Bearer curlmd_test_token',
  })
})

// --- Session auth ---

test('uses session auth headers when available', async () => {
  const requests: CapturedRequest[] = []

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
      requests.push(captureRequest(request))
      return HttpResponse.json({ content: '# Session' })
    }),
  )

  Session.write({
    organization_id: 'org_123',
    refresh_token: 'rt_test',
    refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
  })

  const { tools } = loadPlugin()
  await tools[0]!.execute({ url: 'https://example.com' }, { logger: { log() {} } } as any)

  expect(requests[0]?.headers).toEqual({
    accept: 'application/json',
    authorization: 'Bearer access-token-1',
    'x-organization-id': 'org_123',
  })

  Session.delete()
})

test('caches session auth headers in memory', async () => {
  const requests: CapturedRequest[] = []
  let headersCalls = 0

  server.use(
    http.post('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin || url.pathname !== '/api/auth/headers')
        return passthrough()
      headersCalls++
      return HttpResponse.json({
        authorization: 'Bearer access-token-1',
        expires_at: '2099-01-01T00:00:00.000Z',
      })
    }),
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json({ content: '# Cached' })
    }),
  )

  Session.write({
    refresh_token: 'rt_test',
    refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
  })

  const { tools } = loadPlugin()
  await tools[0]!.execute({ url: 'https://example.com/a' }, { logger: { log() {} } } as any)
  await tools[0]!.execute({ url: 'https://example.com/b' }, { logger: { log() {} } } as any)

  expect(headersCalls).toBe(1)
  expect(requests).toHaveLength(2)

  Session.delete()
})

// --- Retry on session 401 ---

test('retries once on session 401', async () => {
  let fetchCount = 0

  server.use(
    http.post('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin || url.pathname !== '/api/auth/headers')
        return passthrough()
      return HttpResponse.json({
        authorization: 'Bearer access-token-fresh',
        expires_at: '2099-01-01T00:00:00.000Z',
      })
    }),
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      fetchCount++
      if (fetchCount === 1) return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
      return HttpResponse.json({ content: '# Retried' })
    }),
  )

  Session.write({
    refresh_token: 'rt_test',
    refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
  })

  const { tools } = loadPlugin()
  const result = await tools[0]!.execute({ url: 'https://example.com' }, {
    logger: { log() {} },
  } as any)

  expect(fetchCount).toBe(2)
  expect((result as any).auth).toBe('session')
  expect((result as any).markdown).toBe('# Retried')

  Session.delete()
})

// --- Error handling ---

test('throws validation issues for 400', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json(
        { issues: [{ message: 'Invalid URL', path: 'url' }] },
        { status: 400 },
      )
    }),
  )

  const { tools } = loadPlugin()
  await expect(
    tools[0]!.execute({ url: 'https://example.com' }, { logger: { log() {} } } as any),
  ).rejects.toThrow('url: Invalid URL')
})

test('throws CLI-oriented error for invalid API key 401', async () => {
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
  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')

  const { tools } = loadPlugin()
  await expect(
    tools[0]!.execute({ url: 'https://example.com' }, { logger: { log() {} } } as any),
  ).rejects.toThrow('curl.md authentication failed. Fix CURLMD_API_KEY.')
})

test('throws CLI-oriented error for anon 401', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }),
  )

  const { tools } = loadPlugin()
  await expect(
    tools[0]!.execute({ url: 'https://example.com' }, { logger: { log() {} } } as any),
  ).rejects.toThrow(
    'curl.md authentication required. Set CURLMD_API_KEY or run `curl.md auth login`.',
  )
})

test('throws CLI-oriented error for 403 and clears org', async () => {
  Session.write({ organization_id: 'org_bad' })

  server.use(
    http.post('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin || url.pathname !== '/api/auth/headers')
        return passthrough()
      return HttpResponse.json({
        authorization: 'Bearer access-token-1',
        expires_at: '2099-01-01T00:00:00.000Z',
        organization_id: 'org_bad',
      })
    }),
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json({ message: 'Organization access denied' }, { status: 403 })
    }),
  )

  const { tools } = loadPlugin()
  await expect(
    tools[0]!.execute({ url: 'https://example.com' }, { logger: { log() {} } } as any),
  ).rejects.toThrow('Organization access denied. Set CURLMD_API_KEY or run `curl.md auth login`.')

  expect(Session.read()?.organization_id).toBeUndefined()
  Session.delete()
})

test('throws CLI-oriented rate limit error for anon 429', async () => {
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

  const { tools } = loadPlugin()
  await expect(
    tools[0]!.execute({ url: 'https://example.com' }, { logger: { log() {} } } as any),
  ).rejects.toThrow(
    'Rate limit exceeded. Try again in 12s. Set CURLMD_API_KEY or run `curl.md auth login` for higher limits.',
  )
})

test('throws credits guidance for authenticated 429', async () => {
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

  const { tools } = loadPlugin()
  await expect(
    tools[0]!.execute({ url: 'https://example.com' }, { logger: { log() {} } } as any),
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

  const { tools } = loadPlugin()
  await expect(
    tools[0]!.execute({ url: 'https://example.com' }, { logger: { log() {} } } as any),
  ).rejects.toThrow('(AI_FAILED) error code: 1031')
})

// --- Helpers ---

function loadPlugin() {
  const tools: Array<Record<string, any>> = []
  const handlers: Array<{ event: string; fn: (...args: any[]) => any }> = []

  plugin({
    logger: { log() {} },
    on(event: string, handler: (...args: any[]) => any) {
      handlers.push({ event, fn: handler })
      return { unsubscribe() {} }
    },
    registerTool(definition: Record<string, any>) {
      tools.push(definition)
      return { unsubscribe() {} }
    },
  } as any)

  return { handlers, tools }
}

function captureRequest(request: Request): CapturedRequest {
  return {
    headers: Object.fromEntries(request.headers.entries()),
    method: request.method,
    url: request.url,
  }
}

type CapturedRequest = {
  headers: Record<string, string>
  method: string
  url: string
}
