import child_process from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import extension from '../extensions/index.ts'

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
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ account: { login: 'tmm' } }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }),
  )

  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')
  vi.stubGlobal('fetch', fetch)

  const { commands } = loadExtension()
  await commands[0]!.handler('', {
    ui: {
      notify,
    },
  })

  expect(fetch.mock.calls[0]![0]).toBe('https://curl.md/api/auth/me')
  expect(fetch.mock.calls[0]![1]).toMatchObject({
    method: 'GET',
  })
  expect(getHeaders(fetch.mock.calls[0]![1])).toEqual({
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
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ content: '# Pricing' }), {
      headers: {
        'content-type': 'application/json',
        'x-cache': 'MISS',
        'x-request-id': 'req_123',
        'x-tokens-count': '42',
        'x-tokens-saved': '128',
      },
      status: 200,
    }),
  )
  mockExecFileError(new Error('not authenticated'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)
  vi.stubGlobal('fetch', fetch)

  const { tools } = loadExtension()
  const result = await tools[0]!.execute('call_1', {
    fresh: true,
    keywords: ['pricing', 'billing'],
    mode: 'rush',
    objective: 'compare plans',
    url: 'example.com/docs?q=1',
  })

  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0]![0]).toBe(
    'https://curl.md/api/https%3A%2F%2Fexample.com%2Fdocs%3Fq%3D1?fresh=&keywords=pricing%2Cbilling&mode=rush&objective=compare+plans',
  )
  expect(fetch.mock.calls[0]![1]).toMatchObject({
    method: 'GET',
  })
  expect(getHeaders(fetch.mock.calls[0]![1])).toEqual({
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
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ content: '# Authenticated' }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }),
  )
  mockExecFileSuccess({
    authorization: 'Bearer cli-session',
    expires_at: null,
    organization_id: 'org_123',
  })
  vi.stubGlobal('fetch', fetch)

  const { tools } = loadExtension()
  await tools[0]!.execute('call_1', { url: 'https://example.com' })

  expect(child_process.execFile).toHaveBeenCalledTimes(1)
  expect(child_process.execFile).toHaveBeenCalledWith(
    process.execPath,
    expect.arrayContaining(['auth', 'headers', '--json']),
    expect.any(Object),
    expect.any(Function),
  )
  expect(getHeaders(fetch.mock.calls[0]![1])).toEqual({
    accept: 'application/json',
    authorization: 'Bearer cli-session',
    'x-organization-id': 'org_123',
  })
})

test('caches CLI auth headers in memory', async () => {
  const fetch = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify({ content: '# Authenticated' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
  )
  mockExecFileSuccess({
    authorization: 'Bearer cli-session',
    expires_at: null,
    organization_id: null,
  })
  vi.stubGlobal('fetch', fetch)

  const { tools } = loadExtension()
  await tools[0]!.execute('call_1', { url: 'https://example.com/a' })
  await tools[0]!.execute('call_2', { url: 'https://example.com/b' })

  expect(child_process.execFile).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('prefers CURLMD_API_KEY for authentication', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ content: '# Authenticated' }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }),
  )
  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')
  vi.stubGlobal('fetch', fetch)

  const { tools } = loadExtension()
  await tools[0]!.execute('call_1', { url: 'https://example.com' })

  expect(fetch.mock.calls[0]![1]).toMatchObject({
    method: 'GET',
  })
  expect(getHeaders(fetch.mock.calls[0]![1])).toEqual({
    accept: 'application/json',
    authorization: 'Bearer curlmd_test_token',
  })
})

test('throws validation issues for bad requests', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        issues: [{ message: 'Invalid URL', path: 'url' }],
      }),
      {
        headers: { 'content-type': 'application/json' },
        status: 400,
      },
    ),
  )
  mockExecFileError(new Error('not authenticated'))
  vi.stubGlobal('fetch', fetch)

  const { tools } = loadExtension()

  await expect(tools[0]!.execute('call_1', { url: 'https://example.com' })).rejects.toThrow(
    'url: Invalid URL',
  )
})

test('throws a helpful authentication error for invalid API keys', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        code: 'invalid_api_key',
        message: 'Invalid API key',
      }),
      {
        headers: { 'content-type': 'application/json' },
        status: 401,
      },
    ),
  )
  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')
  vi.stubGlobal('fetch', fetch)

  const { tools } = loadExtension()

  await expect(tools[0]!.execute('call_1', { url: 'https://example.com' })).rejects.toThrow(
    'curl.md authentication failed. Fix CURLMD_API_KEY.',
  )
})

test('throws a helpful rate limit error for anonymous requests', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-rate-limit-'))
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        code: 'rate_limit_exceeded',
        message: 'Rate limit exceeded',
      }),
      {
        headers: {
          'content-type': 'application/json',
          'retry-after': '12',
        },
        status: 429,
      },
    ),
  )
  mockExecFileError(new Error('not authenticated'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)
  vi.stubGlobal('fetch', fetch)

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

function getHeaders(init: unknown) {
  const headers = (init as { headers?: Headers }).headers
  return headers ? Object.fromEntries(headers.entries()) : {}
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
