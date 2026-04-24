import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultBaseUrl } from 'curl.md'
import { Session } from 'curl.md/internal'
import { HttpResponse, http, passthrough } from 'msw'
import { setupServer } from 'msw/node'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'

const mcpState = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  infos: [] as Array<{ name: string; version: string }>,
  tools: [] as Array<{
    config: { inputSchema: { safeParse: (input: unknown) => { success: boolean } }; title: string }
    handler: (input: Record<string, unknown>) => Promise<unknown>
    name: string
  }>,
  transports: [] as unknown[],
}))

vi.mock('@modelcontextprotocol/server', () => ({
  McpServer: class {
    connect = mcpState.connect

    constructor(info: { name: string; version: string }) {
      mcpState.infos.push(info)
    }

    registerTool(
      name: string,
      config: {
        inputSchema: { safeParse: (input: unknown) => { success: boolean } }
        title: string
      },
      handler: (input: Record<string, unknown>) => Promise<unknown>,
    ) {
      mcpState.tools.push({ config, handler, name })
    }
  },
  StdioServerTransport: class {
    constructor() {
      mcpState.transports.push(this)
    }
  },
}))

const server = setupServer()

let xdgDataHome = ''

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  return () => server.close()
})

beforeEach(() => {
  xdgDataHome = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-claude-test-'))
  vi.stubEnv('XDG_DATA_HOME', xdgDataHome)
})

afterEach(() => {
  Session.delete(defaultBaseUrl)
  fs.rmSync(xdgDataHome, { force: true, recursive: true })
  mcpState.connect.mockClear()
  mcpState.infos.length = 0
  mcpState.tools.length = 0
  mcpState.transports.length = 0
  server.resetHandlers()
  vi.restoreAllMocks()
  vi.resetModules()
  vi.unstubAllEnvs()
})

test('registers the Claude MCP tool and connects stdio transport', async () => {
  const tool = await loadTool()

  expect(mcpState.infos).toEqual([{ name: 'curl_md', version: '0.0.1' }])
  expect(tool.name).toBe('curl_md')
  expect(
    tool.config.inputSchema.safeParse({
      fresh: true,
      keywords: ['plugin'],
      mode: 'smart',
      objective: 'Summarize the docs',
      url: 'example.com',
    }).success,
  ).toBe(true)
  expect(mcpState.transports).toHaveLength(1)
  expect(mcpState.connect).toHaveBeenCalledWith(mcpState.transports[0])
})

test('returns stripped markdown and forwards fetch options', async () => {
  const requests: CapturedRequest[] = []

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json({
        content: '# Example\n\n---\n\nPowered by [curl.md](https://curl.md)',
      })
    }),
  )

  const tool = await loadTool()
  const result = await tool.handler({
    fresh: true,
    keywords: ['plugin'],
    mode: 'smart',
    objective: 'Summarize the docs',
    url: 'example.com',
  })

  expect(requests[0]?.url).toContain(`${defaultBaseUrl}/api/https://example.com/`)
  expect(requests[0]?.url).toContain('fresh=')
  expect(requests[0]?.url).toContain('keywords=plugin')
  expect(requests[0]?.url).toContain('mode=smart')
  expect(requests[0]?.url).toContain('objective=Summarize+the+docs')
  expect(requests[0]?.headers).toEqual({ accept: 'application/json' })
  expect(result).toEqual({
    content: [{ text: '# Example\n\n---\n\nPowered by [curl.md](https://curl.md)', type: 'text' }],
  })
})

test('returns MCP error content for invalid URLs', async () => {
  const tool = await loadTool()
  const result = await tool.handler({ url: 'ftp://example.com' })

  expect(result).toEqual({
    content: [{ text: 'URL must use http or https', type: 'text' }],
    isError: true,
  })
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

  const tool = await loadTool()
  const result = await tool.handler({ url: 'https://example.com' })

  expect(headersCount).toBe(2)
  expect(fetchCount).toBe(2)
  expect(requests[0]?.headers.authorization).toBe('Bearer access-token-1')
  expect(requests[1]?.headers.authorization).toBe('Bearer access-token-2')
  expect(result).toEqual({ content: [{ text: '# Retried', type: 'text' }] })
})

test('clears session organization and returns guidance on 403', async () => {
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

  const tool = await loadTool()
  const result = await tool.handler({ url: 'https://example.com' })

  expect(Session.read(defaultBaseUrl)?.organization_id).toBeUndefined()
  expectErrorText(result).toBe(
    'Organization access denied. Set CURLMD_API_KEY or run `curl.md auth login`.',
  )
})

test('surfaces anonymous authentication guidance on 401', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }),
  )

  const tool = await loadTool()
  const result = await tool.handler({ url: 'https://example.com' })

  expectErrorText(result).toBe(
    'curl.md authentication required. Set CURLMD_API_KEY or run `curl.md auth login`.',
  )
})

test('uses CURLMD_API_KEY and surfaces invalid API key guidance on 401', async () => {
  const requests: CapturedRequest[] = []

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json(
        { code: 'invalid_api_key', message: 'Invalid API key' },
        { status: 401 },
      )
    }),
  )
  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')

  const tool = await loadTool()
  const result = await tool.handler({ url: 'https://example.com' })

  expect(requests[0]?.headers).toEqual({
    accept: 'application/json',
    authorization: 'Bearer curlmd_test_token',
  })
  expectErrorText(result).toBe('curl.md authentication failed. Fix CURLMD_API_KEY.')
})

test('formats validation issues for 400 responses', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json(
        {
          issues: [
            { message: 'Invalid URL', path: 'url' },
            { message: 'Required', path: 'objective' },
          ],
        },
        { status: 400 },
      )
    }),
  )

  const tool = await loadTool()
  const result = await tool.handler({ url: 'https://example.com' })

  expectErrorText(result).toBe('url: Invalid URL\nobjective: Required')
})

test('surfaces anonymous rate limit guidance on 429', async () => {
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

  const tool = await loadTool()
  const result = await tool.handler({ url: 'https://example.com' })

  expectErrorText(result).toBe(
    'Rate limit exceeded. Try again in 12s. Set CURLMD_API_KEY or run `curl.md auth login` for higher limits.',
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

  const tool = await loadTool()
  const result = await tool.handler({ url: 'https://example.com' })

  expectErrorText(result).toBe('(AI_FAILED) error code: 1031')
})

async function loadTool() {
  await import('./server.ts')
  const tool = mcpState.tools.find((tool) => tool.name === 'curl_md')
  if (!tool) throw new Error('Expected curl_md tool to be registered')
  return tool
}

function captureRequest(request: Request): CapturedRequest {
  return {
    headers: Object.fromEntries(request.headers.entries()),
    method: request.method,
    url: request.url,
  }
}

function expectErrorText(result: unknown) {
  expect(result).toEqual(
    expect.objectContaining({
      content: [expect.objectContaining({ type: 'text' })],
      isError: true,
    }),
  )

  return expect((result as { content: Array<{ text: string }> }).content[0]?.text)
}

type CapturedRequest = {
  headers: Record<string, string>
  method: string
  url: string
}
