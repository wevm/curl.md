import child_process from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultBaseUrl } from 'curl.md'
import { HttpResponse, http, passthrough } from 'msw'
import { afterEach, expect, test, vi } from 'vitest'
import extension from '../extensions/index.ts'
import { server } from './server.ts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

test('registers curl.md Pi tool and status command', async () => {
  const notify = vi.fn()
  mockExecFileError(new Error('not authenticated'))
  const { commands, tools } = loadExtension()

  expect(commands.map((command) => command.name)).toEqual(['curlmd_status'])
  expect(tools.map((tool) => tool.name)).toEqual(['curlmd_fetch'])

  await commands[0]!.handler('', {
    ui: {
      notify,
    },
  })

  expect(notify).toHaveBeenCalledWith(
    'curl.md Pi\nTool: curlmd_fetch\nCLI: installed\nAuth: anonymous\nNext: set CURLMD_API_KEY or run `curl.md auth login`.',
    'info',
  )
})

test('status command verifies API key auth state', async () => {
  const notify = vi.fn()
  const requests: CapturedRequest[] = []

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin || url.pathname !== '/api/auth/me')
        return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json({ account: { login: 'tmm' } })
    }),
  )

  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')

  const { commands } = loadExtension()
  await commands[0]!.handler('', {
    ui: {
      notify,
    },
  })

  expect(requests[0]?.url).toBe(`${defaultBaseUrl}/api/auth/me`)
  expect(requests[0]?.method).toBe('GET')
  expect(requests[0]?.headers).toEqual({
    accept: 'application/json',
    authorization: 'Bearer curlmd_test_token',
  })
  expect(notify).toHaveBeenCalledWith(
    'curl.md Pi\nTool: curlmd_fetch\nCLI: installed\nAuth: api_key (tmm)',
    'info',
  )
})

test('fetches markdown from curl.md anonymously', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-anon-'))
  const requests: CapturedRequest[] = []

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        url.origin !== new URL(defaultBaseUrl).origin ||
        url.pathname !== '/api/https://example.com/docs'
      )
        return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json(
        { content: '# Pricing' },
        {
          headers: {
            'x-cache': 'MISS',
            'x-request-id': 'req_123',
            'x-tokens-count': '42',
            'x-tokens-saved': '128',
          },
        },
      )
    }),
  )
  mockExecFileError(new Error('not authenticated'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)

  const { tools } = loadExtension()
  const result = await tools[0]!.execute('call_1', {
    fresh: true,
    keywords: ['pricing', 'billing'],
    mode: 'rush',
    objective: 'compare plans',
    url: 'example.com/docs?q=1',
  })

  expect(requests).toHaveLength(1)
  expect(requests[0]?.url).toContain(`${defaultBaseUrl}/api/https://example.com/docs?q=1`)
  expect(requests[0]?.url).toContain('fresh=')
  expect(requests[0]?.url).toContain('keywords=pricing%2Cbilling')
  expect(requests[0]?.url).toContain('mode=rush')
  expect(requests[0]?.url).toContain('objective=compare+plans')
  expect(requests[0]?.method).toBe('GET')
  expect(requests[0]?.headers).toEqual({
    accept: 'application/json',
  })
  expect(result).toEqual({
    content: [{ type: 'text', text: '# Pricing' }],
    details: {
      auth: 'anonymous',
      cache: 'MISS',
      credits_remaining: undefined,
      request_id: 'req_123',
      tokens_count: 42,
      tokens_saved: 128,
      url: 'https://example.com/docs?q=1',
    },
  })

  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('uses CLI auth headers when available', async () => {
  const requests: CapturedRequest[] = []

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json({ content: '# Authenticated' })
    }),
  )
  mockExecFileSuccess({
    authorization: 'Bearer cli-session',
    expires_at: '2099-01-01T00:00:00.000Z',
    organization_id: 'org_123',
  })

  const { tools } = loadExtension()
  await tools[0]!.execute('call_1', { url: 'https://example.com' })

  expect(child_process.execFile).toHaveBeenCalledTimes(1)
  expect(child_process.execFile).toHaveBeenCalledWith(
    process.execPath,
    expect.arrayContaining(['auth', 'headers', '--json']),
    expect.any(Object),
    expect.any(Function),
  )
  expect(requests[0]?.headers).toEqual({
    accept: 'application/json',
    authorization: 'Bearer cli-session',
    'x-organization-id': 'org_123',
  })
})

test('caches CLI auth headers in memory', async () => {
  const requests: CapturedRequest[] = []

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json({ content: '# Authenticated' })
    }),
  )
  mockExecFileSuccess({
    authorization: 'Bearer cli-session',
    expires_at: '2099-01-01T00:00:00.000Z',
    organization_id: null,
  })

  const { tools } = loadExtension()
  await tools[0]!.execute('call_1', { url: 'https://example.com/a' })
  await tools[0]!.execute('call_2', { url: 'https://example.com/b' })

  expect(child_process.execFile).toHaveBeenCalledTimes(1)
  expect(requests).toHaveLength(2)
})

test('refreshes CLI auth headers when cached access token is near expiry', async () => {
  const requests: CapturedRequest[] = []

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json({ content: '# Authenticated' })
    }),
  )
  let execCalls = 0
  vi.spyOn(child_process, 'execFile').mockImplementation(((...args: any[]) => {
    const callback = args.at(-1) as
      | ((error: null, stdout: string, stderr: string) => void)
      | undefined
    execCalls++
    const callCount = execCalls
    const expires_at =
      callCount === 1 ? new Date(Date.now() + 30_000) : new Date(Date.now() + 3600_000)
    callback?.(
      null,
      JSON.stringify({
        authorization: `Bearer cli-session-${callCount}`,
        expires_at: expires_at.toISOString(),
        organization_id: null,
      }),
      '',
    )
    return {} as child_process.ChildProcess
  }) as typeof child_process.execFile)

  const { tools } = loadExtension()
  await tools[0]!.execute('call_1', { url: 'https://example.com/a' })
  await tools[0]!.execute('call_2', { url: 'https://example.com/b' })

  expect(child_process.execFile).toHaveBeenCalledTimes(2)
  expect(requests[0]?.headers).toMatchObject({
    authorization: 'Bearer cli-session-1',
  })
  expect(requests[1]?.headers).toMatchObject({
    authorization: 'Bearer cli-session-2',
  })
})

test('prefers CURLMD_API_KEY for authentication', async () => {
  const requests: CapturedRequest[] = []

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json({ content: '# Authenticated' })
    }),
  )
  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')

  const { tools } = loadExtension()
  await tools[0]!.execute('call_1', { url: 'https://example.com' })

  expect(requests[0]?.method).toBe('GET')
  expect(requests[0]?.headers).toEqual({
    accept: 'application/json',
    authorization: 'Bearer curlmd_test_token',
  })
})

test('throws validation issues for bad requests', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json(
        {
          issues: [{ message: 'Invalid URL', path: 'url' }],
        },
        {
          status: 400,
        },
      )
    }),
  )
  mockExecFileError(new Error('not authenticated'))

  const { tools } = loadExtension()

  await expect(tools[0]!.execute('call_1', { url: 'https://example.com' })).rejects.toThrow(
    'url: Invalid URL',
  )
})

test('throws a helpful authentication error for invalid API keys', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json(
        {
          code: 'invalid_api_key',
          message: 'Invalid API key',
        },
        {
          status: 401,
        },
      )
    }),
  )
  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')

  const { tools } = loadExtension()

  await expect(tools[0]!.execute('call_1', { url: 'https://example.com' })).rejects.toThrow(
    'curl.md authentication failed. Fix CURLMD_API_KEY.',
  )
})

test('throws a helpful rate limit error for anonymous requests', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-rate-limit-'))
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json(
        {
          code: 'rate_limit_exceeded',
          message: 'Rate limit exceeded',
        },
        {
          headers: {
            'retry-after': '12',
          },
          status: 429,
        },
      )
    }),
  )
  mockExecFileError(new Error('not authenticated'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)

  const { tools } = loadExtension()

  await expect(tools[0]!.execute('call_1', { url: 'https://example.com' })).rejects.toThrow(
    'Rate limit exceeded. Try again in 12s. Set CURLMD_API_KEY or run `curl.md auth login` for higher limits.',
  )

  fs.rmSync(tmpDir, { force: true, recursive: true })
})

function loadExtension() {
  const commands: Array<Record<string, any>> = []
  const tools: Array<Record<string, any>> = []

  extension({
    registerCommand(name: string, options: Record<string, any>) {
      commands.push({ name, ...options })
    },
    registerTool(definition: Record<string, any>) {
      tools.push(definition)
    },
  } as any)

  return { commands, tools }
}

function captureRequest(request: Request): CapturedRequest {
  return {
    headers: Object.fromEntries(request.headers.entries()),
    method: request.method,
    url: request.url,
  }
}

function mockExecFileError(error: Error) {
  vi.spyOn(child_process, 'execFile').mockImplementation(((...args: any[]) => {
    const callback = args.at(-1) as
      | ((error: Error, stdout: string, stderr: string) => void)
      | undefined
    callback?.(error, '', '')
    return {} as child_process.ChildProcess
  }) as typeof child_process.execFile)
}

function mockExecFileSuccess(json: unknown) {
  vi.spyOn(child_process, 'execFile').mockImplementation(((...args: any[]) => {
    const callback = args.at(-1) as
      | ((error: null, stdout: string, stderr: string) => void)
      | undefined
    callback?.(null, JSON.stringify(json), '')
    return {} as child_process.ChildProcess
  }) as typeof child_process.execFile)
}

type CapturedRequest = {
  headers: Record<string, string>
  method: string
  url: string
}
