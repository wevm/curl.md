import child_process from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultBaseUrl } from 'curl.md'
import { Auth, Session } from 'curl.md/internal'
import { HttpResponse, http, passthrough } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import packageJson from '../package.json' with { type: 'json' }
import { server } from '../test/server.ts'
import extension from './index.ts'

const extensionHeader = `${packageJson.name} v${packageJson.version}`
const mockCliPath = '/opt/homebrew/bin/curl.md'
let defaultXdgDataHome: string

beforeEach(() => {
  defaultXdgDataHome = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-test-'))
  vi.stubEnv('XDG_DATA_HOME', defaultXdgDataHome)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  fs.rmSync(defaultXdgDataHome, { force: true, recursive: true })
})

test('registers curl.md Pi tool and commands', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-reg-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)
  mockCurlMdCliInstalled(false)
  const notify = vi.fn()
  const { commands, tools } = loadExtension()

  expect(commands.map((command) => command.name)).toEqual(
    expect.arrayContaining(['curl_md_login', 'curl_md_logout', 'curl_md_org', 'curl_md_status']),
  )
  expect(tools.map((tool) => tool.name)).toEqual(
    expect.arrayContaining(['read_web_page', 'curl_md']),
  )

  await commands[3]!.handler('', { ui: { notify } })

  expect(notify).toHaveBeenCalledWith(
    `${extensionHeader}\nAuth: Not authenticated. Run curl_md_login or set CURLMD_API_KEY.\nTool: read_web_page (alias: curl_md)\nCLI: not installed`,
    'info',
  )

  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('login command mentions curl.md when already authenticated', async () => {
  const notify = vi.fn()
  vi.spyOn(Auth, 'startLogin').mockResolvedValue({
    ok: true,
    data: { kind: 'already_authenticated', login: 'tmm' },
  })

  const { commands } = loadExtension()
  await commands[0]!.handler('', { ui: { notify } })

  expect(notify).toHaveBeenCalledWith('Already logged in to curl.md as tmm', 'info')
})

test('login command shows start error', async () => {
  const notify = vi.fn()
  vi.spyOn(Auth, 'startLogin').mockResolvedValue({
    ok: false,
    error: { code: 'bad_request', message: 'Nope' },
  })

  const { commands } = loadExtension()
  await commands[0]!.handler('', { ui: { notify } })

  expect(notify).toHaveBeenCalledWith('Failed to log in to curl.md: Nope', 'error')
})

test('login command completes device flow', async () => {
  const execSpy = vi.spyOn(child_process, 'exec').mockImplementation(() => ({}) as any)
  const notify = vi.fn()
  const custom = vi.fn().mockResolvedValue({
    ok: true,
    data: { expires_at: '2099-01-01T00:00:00.000Z', login: 'tmm' },
  })
  vi.spyOn(Auth, 'startLogin').mockResolvedValue({
    ok: true,
    data: {
      kind: 'device_flow',
      code: 'dev_123',
      interval: 5,
      url: 'https://curl.local/login',
      user_code: 'ABC-123',
      verification_uri: 'https://curl.local/login',
    },
  })

  const { commands } = loadExtension()
  await commands[0]!.handler('', { ui: { custom, notify } })

  expect(execSpy).toHaveBeenCalledTimes(1)
  expect(custom).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenCalledWith('Logged in as tmm to curl.md', 'info')
})

test('login command shows waitForLogin error', async () => {
  const execSpy = vi.spyOn(child_process, 'exec').mockImplementation(() => ({}) as any)
  const notify = vi.fn()
  const custom = vi.fn().mockResolvedValue({
    ok: false,
    error: { code: 'denied', message: 'Denied' },
  })
  vi.spyOn(Auth, 'startLogin').mockResolvedValue({
    ok: true,
    data: {
      kind: 'device_flow',
      code: 'dev_123',
      interval: 5,
      url: 'https://curl.local/login',
      user_code: 'ABC-123',
      verification_uri: 'https://curl.local/login',
    },
  })

  const { commands } = loadExtension()
  await commands[0]!.handler('', { ui: { custom, notify } })

  expect(execSpy).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenCalledWith('Failed to log in to curl.md: Denied', 'error')
})

test('login command stops quietly when cancelled', async () => {
  const execSpy = vi.spyOn(child_process, 'exec').mockImplementation(() => ({}) as any)
  const notify = vi.fn()
  const custom = vi.fn().mockResolvedValue(null)
  vi.spyOn(Auth, 'startLogin').mockResolvedValue({
    ok: true,
    data: {
      kind: 'device_flow',
      code: 'dev_123',
      interval: 5,
      url: 'https://curl.local/login',
      user_code: 'ABC-123',
      verification_uri: 'https://curl.local/login',
    },
  })

  const { commands } = loadExtension()
  await commands[0]!.handler('', { ui: { custom, notify } })

  expect(execSpy).toHaveBeenCalledTimes(1)
  expect(notify).not.toHaveBeenCalled()
})

test('logout command says already logged out', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-logout-empty-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)
  const notify = vi.fn()

  const { commands } = loadExtension()
  await commands[1]!.handler('', { ui: { notify } })

  expect(notify).toHaveBeenCalledWith('Already logged out of curl.md', 'info')

  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('logout command shows error', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-logout-error-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)
  Session.write({ refresh_token: 'rt_test', refresh_token_expires_at: '2099-01-01T00:00:00.000Z' })

  const notify = vi.fn()
  vi.spyOn(Auth, 'logout').mockResolvedValue({
    ok: false,
    error: { code: 'failed', message: 'Bad logout' },
  })

  const { commands } = loadExtension()
  await commands[1]!.handler('', { ui: { notify } })

  expect(notify).toHaveBeenCalledWith('Failed to log out of curl.md: Bad logout', 'error')

  Session.delete()
  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('logout command succeeds', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-logout-ok-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)
  Session.write({ refresh_token: 'rt_test', refresh_token_expires_at: '2099-01-01T00:00:00.000Z' })

  const notify = vi.fn()
  vi.spyOn(Auth, 'logout').mockResolvedValue({
    ok: true,
    data: { login: 'tmm' },
  })

  const { commands } = loadExtension()
  await commands[1]!.handler('', { ui: { notify } })

  expect(notify).toHaveBeenCalledWith('Logged out of tmm from curl.md', 'info')

  Session.delete()
  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('status command verifies API key auth state', async () => {
  const notify = vi.fn()
  const requests: CapturedRequest[] = []
  mockCurlMdCliInstalled(true)

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
  await commands[3]!.handler('', { ui: { notify } })

  expect(requests[0]?.url).toBe(`${defaultBaseUrl}/api/auth/me`)
  expect(requests[0]?.method).toBe('GET')
  expect(requests[0]?.headers).toEqual({
    accept: 'application/json',
    authorization: 'Bearer curlmd_test_token',
  })
  expect(notify).toHaveBeenCalledWith(
    `${extensionHeader}\nAuth: api_key (tmm)\nOrganization: none\nTool: read_web_page (alias: curl_md)\nCLI: ${mockCliPath}`,
    'info',
  )
})

test('status command shows unauthenticated api key state', async () => {
  const notify = vi.fn()
  mockCurlMdCliInstalled(true)

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin || url.pathname !== '/api/auth/me')
        return passthrough()
      return HttpResponse.json({ account: null })
    }),
  )

  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')

  const { commands } = loadExtension()
  await commands[3]!.handler('', { ui: { notify } })

  expect(notify).toHaveBeenCalledWith(
    `${extensionHeader}\nAuth: api_key not authenticated. Refresh CURLMD_API_KEY.\nTool: read_web_page (alias: curl_md)\nCLI: ${mockCliPath}`,
    'info',
  )
})

test('status command shows verification error', async () => {
  const notify = vi.fn()
  mockCurlMdCliInstalled(true)

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin || url.pathname !== '/api/auth/me')
        return passthrough()
      return HttpResponse.json({ code: 'request_failed', message: 'Boom' }, { status: 500 })
    }),
  )

  vi.stubEnv('CURLMD_API_KEY', 'curlmd_test_token')

  const { commands } = loadExtension()
  await commands[3]!.handler('', { ui: { notify } })

  expect(notify).toHaveBeenCalledWith(
    `${extensionHeader}\nAuth: api_key verification failed. (REQUEST_FAILED) Boom\nTool: read_web_page (alias: curl_md)\nCLI: ${mockCliPath}`,
    'info',
  )
})

test('status command shows session verification error', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-status-session-error-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)
  mockCurlMdCliInstalled(true)
  const notify = vi.fn()

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
      if (url.origin !== new URL(defaultBaseUrl).origin || url.pathname !== '/api/auth/me')
        return passthrough()
      return HttpResponse.json({ code: 'request_failed', message: 'Boom' }, { status: 500 })
    }),
  )

  Session.write({
    refresh_token: 'rt_test',
    refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
  })

  const { commands } = loadExtension()
  await commands[3]!.handler('', { ui: { notify } })

  expect(notify).toHaveBeenCalledWith(
    `${extensionHeader}\nAuth: session verification failed. (REQUEST_FAILED) Boom\nTool: read_web_page (alias: curl_md)\nCLI: ${mockCliPath}`,
    'info',
  )

  Session.delete()
  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('status command shows active session organization', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-status-org-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)
  mockCurlMdCliInstalled(true)

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
      if (url.origin !== new URL(defaultBaseUrl).origin || url.pathname !== '/api/auth/me')
        return passthrough()
      return HttpResponse.json({
        account: {
          login: 'tmm',
          organizations: [
            { id: 'org_123', login: 'wevm' },
            { id: 'org_456', login: 'tempo' },
          ],
        },
      })
    }),
  )

  Session.write({
    organization_id: 'org_123',
    refresh_token: 'rt_test',
    refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
  })

  const notify = vi.fn()
  const { commands } = loadExtension()
  await commands[3]!.handler('', { ui: { notify } })

  expect(notify).toHaveBeenCalledWith(
    `${extensionHeader}\nAuth: session (tmm)\nOrganization: wevm\nTool: read_web_page (alias: curl_md)\nCLI: ${mockCliPath}`,
    'info',
  )

  Session.delete()
  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('org command uses searchable picker and stores selected org', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-org-custom-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)

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
      if (url.pathname === '/api/orgs') {
        return HttpResponse.json({
          organizations: [
            { id: 'org_123', login: 'acme' },
            { id: 'org_456', login: 'beta' },
          ],
        })
      }
      if (url.pathname === '/api/auth/me') {
        return HttpResponse.json({ account: { login: 'tmm' } })
      }
      return passthrough()
    }),
  )

  Session.write({
    refresh_token: 'rt_test',
    refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
  })

  const custom = vi.fn().mockResolvedValue({ id: 'org_456', kind: 'organization', label: 'beta' })
  const notify = vi.fn()
  const { commands } = loadExtension()

  await commands[2]!.handler('', { ui: { custom, notify } })

  expect(custom).toHaveBeenCalledTimes(1)
  expect(Session.read()?.organization_id).toBe('org_456')
  expect(notify).toHaveBeenCalledWith('Switched curl.md organization to beta', 'info')

  Session.delete()
  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('org command switches directly from login argument', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-org-arg-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)

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
      if (url.pathname === '/api/orgs') {
        return HttpResponse.json({
          organizations: [
            { id: 'org_123', login: 'acme' },
            { id: 'org_456', login: 'beta' },
          ],
        })
      }
      if (url.pathname === '/api/auth/me') {
        return HttpResponse.json({ account: { login: 'tmm' } })
      }
      return passthrough()
    }),
  )

  Session.write({
    refresh_token: 'rt_test',
    refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
  })

  const notify = vi.fn()
  const { commands } = loadExtension()

  await commands[2]!.handler('beta', { ui: { notify } })

  expect(Session.read()?.organization_id).toBe('org_456')
  expect(notify).toHaveBeenCalledWith('Switched curl.md organization to beta', 'info')

  Session.delete()
  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('org command requires authentication', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-org-auth-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)
  const notify = vi.fn()

  const { commands } = loadExtension()
  await commands[2]!.handler('', { ui: { notify } })

  expect(notify).toHaveBeenCalledWith(
    'Not authenticated with curl.md. Run curl_md_login first.',
    'error',
  )

  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('org command shows fetch failure', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-org-fail-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)
  Session.write({ refresh_token: 'rt_test', refresh_token_expires_at: '2099-01-01T00:00:00.000Z' })

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
      return HttpResponse.json({ message: 'boom' }, { status: 500 })
    }),
  )

  const notify = vi.fn()
  const { commands } = loadExtension()
  await commands[2]!.handler('', { ui: { notify } })

  expect(notify).toHaveBeenCalledWith('Failed to fetch curl.md organizations.', 'error')

  Session.delete()
  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('org command keeps session unchanged when cancelled', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-org-cancel-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)
  Session.write({
    organization_id: 'org_123',
    refresh_token: 'rt_test',
    refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
  })

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
      if (url.pathname === '/api/orgs') {
        return HttpResponse.json({ organizations: [{ id: 'org_123', login: 'acme' }] })
      }
      if (url.pathname === '/api/auth/me') {
        return HttpResponse.json({ account: { login: 'tmm' } })
      }
      return passthrough()
    }),
  )

  const custom = vi.fn().mockResolvedValue(undefined)
  const notify = vi.fn()
  const { commands } = loadExtension()
  await commands[2]!.handler('', { ui: { custom, notify } })

  expect(Session.read()?.organization_id).toBe('org_123')
  expect(notify).not.toHaveBeenCalled()

  Session.delete()
  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('org command fallback select marks the active account', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-org-select-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)

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
      if (url.pathname === '/api/orgs') {
        return HttpResponse.json({
          organizations: [{ id: 'org_123', login: 'acme' }],
        })
      }
      if (url.pathname === '/api/auth/me') {
        return HttpResponse.json({ account: { login: 'tmm' } })
      }
      return passthrough()
    }),
  )

  Session.write({
    refresh_token: 'rt_test',
    refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
  })

  const notify = vi.fn()
  const select = vi.fn().mockImplementation(async (_message, options: string[]) => options[1])
  const { commands } = loadExtension()

  await commands[2]!.handler('', { ui: { notify, select } })

  expect(select).toHaveBeenCalledTimes(1)
  expect(select.mock.calls[0]?.[0]).toBe('Switch to:')
  expect(select.mock.calls[0]?.[1]).toHaveLength(2)
  expect(select.mock.calls[0]?.[1]?.[1]).toContain('tmm')
  expect(Session.read()?.organization_id).toBeUndefined()
  expect(notify).toHaveBeenCalledWith('Switched curl.md account to tmm', 'info')

  Session.delete()
  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('fetches markdown from curl.md anonymously', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-anon-'))
  const requests: CapturedRequest[] = []

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        url.origin !== new URL(defaultBaseUrl).origin ||
        url.pathname !== '/api/https://example.com/docs%3Fq%3D1'
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
  vi.stubEnv('XDG_DATA_HOME', tmpDir)

  const { tools } = loadExtension()
  const params = tools[0]!.prepareArguments!({
    fresh: true,
    keywords: ['pricing', 'billing'],
    mode: 'rush',
    objective: 'compare plans',
    url: 'example.com/docs?q=1#plans',
  })
  const result = await tools[0]!.execute('call_1', params)

  expect(requests).toHaveLength(1)
  expect(requests[0]?.url).toContain(`${defaultBaseUrl}/api/https://example.com/docs%3Fq%3D1`)
  expect(requests[0]?.url).toContain('anchor=plans')
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
      auth: 'anon',
      cache: 'MISS',
      credits_remaining: undefined,
      fresh: true,
      keywords: ['pricing', 'billing'],
      mode: 'rush',
      objective: 'compare plans',
      request_id: 'req_123',
      tokens_count: 42,
      tokens_saved: 128,
      url: 'https://example.com/docs?q=1#plans',
    },
  })

  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('uses session auth headers when available', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-session-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)

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
      return HttpResponse.json({ content: '# Authenticated' })
    }),
  )

  Session.write({
    organization_id: 'org_123',
    refresh_token: 'rt_test',
    refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
  })

  const { tools } = loadExtension()
  await tools[0]!.execute('call_1', { url: 'https://example.com' })

  expect(requests[0]?.headers).toEqual({
    accept: 'application/json',
    authorization: 'Bearer access-token-1',
    'x-organization-id': 'org_123',
  })

  Session.delete()
  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('caches session auth headers in memory', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-cache-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)

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
      return HttpResponse.json({ content: '# Authenticated' })
    }),
  )

  Session.write({
    refresh_token: 'rt_test',
    refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
  })

  const { tools } = loadExtension()
  await tools[0]!.execute('call_1', { url: 'https://example.com/a' })
  await tools[0]!.execute('call_2', { url: 'https://example.com/b' })

  expect(headersCalls).toBe(1)
  expect(requests).toHaveLength(2)

  Session.delete()
  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('retries once on session 401 with forced auth refresh', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-retry-401-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)

  const requests: CapturedRequest[] = []
  let fetchCount = 0
  let headersCalls = 0

  server.use(
    http.post('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin || url.pathname !== '/api/auth/headers')
        return passthrough()
      headersCalls++
      return HttpResponse.json({
        authorization: `Bearer access-token-${headersCalls === 1 ? 'stale' : 'fresh'}`,
        expires_at: '2099-01-01T00:00:00.000Z',
      })
    }),
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      requests.push(captureRequest(request))
      fetchCount++
      if (fetchCount === 1) return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
      return HttpResponse.json({ content: '# Retried' })
    }),
  )

  Session.write({
    refresh_token: 'rt_test',
    refresh_token_expires_at: '2099-01-01T00:00:00.000Z',
  })

  const { tools } = loadExtension()
  const result = await tools[0]!.execute('call_1', { url: 'https://example.com' })

  expect(headersCalls).toBe(2)
  expect(fetchCount).toBe(2)
  expect(requests.map((request) => request.headers.authorization)).toEqual([
    'Bearer access-token-stale',
    'Bearer access-token-fresh',
  ])
  expect(result.details.auth).toBe('session')
  expect(result.content).toEqual([{ text: '# Retried', type: 'text' }])

  Session.delete()
  fs.rmSync(tmpDir, { force: true, recursive: true })
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-val-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)

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

  const { tools } = loadExtension()

  await expect(tools[0]!.execute('call_1', { url: 'https://example.com' })).rejects.toThrow(
    'url: Invalid URL',
  )

  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('throws a helpful authentication error for invalid API keys', async () => {
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

  const { tools } = loadExtension()

  await expect(tools[0]!.execute('call_1', { url: 'https://example.com' })).rejects.toThrow(
    'curl.md authentication failed. Fix CURLMD_API_KEY.',
  )
})

test('throws a helpful rate limit error for anon requests', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-rate-limit-'))
  vi.stubEnv('XDG_DATA_HOME', tmpDir)

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

  const { tools } = loadExtension()

  await expect(tools[0]!.execute('call_1', { url: 'https://example.com' })).rejects.toThrow(
    'Rate limit exceeded. Try again in 12s. Set CURLMD_API_KEY or run curl_md_login for higher limits.',
  )

  fs.rmSync(tmpDir, { force: true, recursive: true })
})

test('surfaces API error codes for non-ok fetch responses', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      return HttpResponse.json({ code: 'ai_failed', message: 'error code: 1031' }, { status: 500 })
    }),
  )

  const { tools } = loadExtension()

  await expect(tools[0]!.execute('call_1', { url: 'https://example.com' })).rejects.toThrow(
    '(AI_FAILED) error code: 1031',
  )
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

function mockCurlMdCliInstalled(installed: boolean) {
  if (installed) {
    mockCurlMdCliPath(mockCliPath)
    return
  }

  vi.spyOn(child_process, 'spawnSync').mockImplementation(() => {
    return {
      error: Object.assign(new Error('not found'), { code: 'ENOENT' }),
      status: 1,
      stdout: '',
    } as unknown as child_process.SpawnSyncReturns<string>
  })
}

function mockCurlMdCliPath(path: string) {
  vi.spyOn(child_process, 'spawnSync').mockImplementation(() => {
    return {
      status: 0,
      stdout: `${path}\n`,
    } as child_process.SpawnSyncReturns<string>
  })
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
