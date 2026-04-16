import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Plugin } from '@opencode-ai/plugin'
import { defaultBaseUrl } from 'curl.md'
import { HttpResponse, http, passthrough } from 'msw'
import { setupServer } from 'msw/node'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { server as plugin } from './plugin.ts'

const mockServer = setupServer()

let defaultXdgDataHome: string

beforeAll(() => {
  mockServer.listen({ onUnhandledRequest: 'error' })
  return () => mockServer.close()
})

beforeEach(() => {
  defaultXdgDataHome = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-opencode-test-'))
  vi.stubEnv('XDG_DATA_HOME', defaultXdgDataHome)
})

afterEach(() => {
  mockServer.resetHandlers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  fs.rmSync(defaultXdgDataHome, { force: true, recursive: true })
})

test('registers md_fetch tool and redirects webfetch definition', async () => {
  const hooks = await loadPlugin()

  expect(Object.keys(hooks.tool || {})).toEqual(['md_fetch'])

  const output = { description: 'Fetch web content.' }
  await hooks['tool.definition']?.({ toolID: 'webfetch' } as never, output as never)
  expect(output.description).toContain('Use md_fetch instead')
})

test('returns markdown and tool metadata', async () => {
  mockServer.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json(
        { content: '# Example\n\n---\n\nPowered by [curl.md](https://curl.md)' },
        { headers: { 'x-cache': 'HIT' } },
      )
    }),
  )

  const hooks = await loadPlugin()
  const metadata = vi.fn()
  const result = await hooks.tool!.md_fetch.execute(
    { url: 'https://example.com', mode: 'rush', objective: 'test' },
    createToolContext(metadata),
  )

  expect(result).toBe('# Example')
  expect(metadata).toHaveBeenCalledWith({
    metadata: {
      auth: 'anon',
      cache: 'HIT',
      url: 'https://example.com/',
    },
    title: 'md_fetch https://example.com/',
  })
})

test('uses CURLMD_API_KEY when provided', async () => {
  const requests: CapturedRequest[] = []

  mockServer.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      requests.push(captureRequest(request))
      return HttpResponse.json({ content: '# Auth' })
    }),
  )
  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')

  const hooks = await loadPlugin()
  await hooks.tool!.md_fetch.execute({ url: 'https://example.com' }, createToolContext(vi.fn()))

  expect(requests[0]?.headers).toEqual({
    accept: 'application/json',
    authorization: 'Bearer curlmd_test_token',
  })
})

test('surfaces authentication guidance for anonymous 401s', async () => {
  mockServer.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }),
  )

  const hooks = await loadPlugin()
  await expect(
    hooks.tool!.md_fetch.execute({ url: 'https://example.com' }, createToolContext(vi.fn())),
  ).rejects.toThrow(
    'curl.md authentication required. Set CURLMD_API_KEY or run `curl.md auth login`.',
  )
})

async function loadPlugin() {
  return plugin({
    $: undefined as never,
    client: undefined as never,
    directory: process.cwd(),
    experimental_workspace: { register() {} },
    project: { id: 'test', time: { created: Date.now() }, worktree: process.cwd() },
    serverUrl: new URL('http://127.0.0.1:4096'),
    worktree: process.cwd(),
  } as Parameters<Plugin>[0])
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
