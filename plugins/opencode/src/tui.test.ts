import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { defaultBaseUrl } from 'curl.md'
import { Auth, Session } from 'curl.md/internal'
import { HttpResponse, http, passthrough } from 'msw'
import { setupServer } from 'msw/node'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'

const server = setupServer()

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  return () => server.close()
})

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    once: vi.fn(),
    unref: vi.fn(),
  })),
  spawnSync: vi.fn(() => ({
    error: undefined,
    status: 1,
    stdout: '',
  })),
}))

import { tuiPlugin } from './tui.ts'

afterEach(() => {
  server.resetHandlers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

test('package exposes an OpenCode tui entrypoint', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {
    engines?: Record<string, unknown>
    exports?: Record<string, unknown>
  }

  expect(packageJson.engines?.opencode).toBe('^1.0.0')
  expect(packageJson.exports?.['./tui']).toBeTruthy()
})

test('registers a login command and completes device flow', async () => {
  vi.spyOn(Auth, 'startLogin').mockResolvedValue({
    ok: true,
    data: {
      code: 'device_code',
      interval: 1,
      kind: 'device_flow',
      url: 'https://curl.md/device?user_code=ABCD-EFGH',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://curl.md/device',
    },
  })
  vi.spyOn(Auth, 'waitForLogin').mockResolvedValue({
    ok: true,
    data: {
      expires_at: '2099-01-01T00:00:00.000Z',
      login: 'tmm',
    },
  })

  const api = createTuiApi()
  await mountTui(api.api)

  const commands = api.commands()

  expect(commands).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'Log in',
        slash: { name: 'curl_md_login' },
        title: 'Log in',
        value: 'curlmd.login',
      }),
      expect.objectContaining({
        description: 'Log out',
        slash: { name: 'curl_md_logout' },
        title: 'Log out',
        value: 'curlmd.logout',
      }),
      expect.objectContaining({
        description: 'Switch organization',
        slash: { name: 'curl_md_org' },
        title: 'Switch organization',
        value: 'curlmd.org',
      }),
      expect.objectContaining({
        description: 'Show status',
        slash: { name: 'curl_md_status' },
        title: 'Show status',
        value: 'curlmd.status',
      }),
    ]),
  )

  await findCommand(commands, 'curlmd.login').onSelect?.()

  expect(spawn).toHaveBeenCalledWith(
    expect.any(String),
    expect.arrayContaining(['https://curl.md/device?user_code=ABCD-EFGH']),
    expect.objectContaining({ detached: true, stdio: 'ignore' }),
  )
  expect(api.dialogAlert).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.stringContaining('ABCD-EFGH'),
      title: 'Login to curl.md',
    }),
  )
  expect(Auth.waitForLogin).toHaveBeenCalledWith(
    defaultBaseUrl,
    expect.objectContaining({ code: 'device_code', interval: 1 }),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
  expect(api.clear).toHaveBeenCalledTimes(1)
  expect(api.toast).toHaveBeenLastCalledWith({
    duration: 6_000,
    message: 'Logged in as tmm.',
    title: 'curl.md',
    variant: 'success',
  })
})

test('keeps already-authenticated toast visible longer', async () => {
  vi.spyOn(Auth, 'startLogin').mockResolvedValue({
    ok: true,
    data: {
      kind: 'already_authenticated',
      login: 'tmm',
    },
  })

  const api = createTuiApi()
  await mountTui(api.api)

  await findCommand(api.commands(), 'curlmd.login').onSelect?.()

  expect(api.clear).toHaveBeenCalledTimes(1)
  expect(api.toast).toHaveBeenCalledWith({
    duration: 6_000,
    message: 'Already logged in as tmm.',
    title: 'curl.md',
    variant: 'info',
  })
})

test('logs out of curl.md', async () => {
  vi.spyOn(Session, 'read').mockReturnValue({ refresh_token: 'rt_test' })
  vi.spyOn(Auth, 'logout').mockResolvedValue({
    ok: true,
    data: { login: 'tmm' },
  })

  const api = createTuiApi()
  await mountTui(api.api)

  await findCommand(api.commands(), 'curlmd.logout').onSelect?.()

  expect(api.clear).toHaveBeenCalledTimes(1)
  expect(Auth.logout).toHaveBeenCalledWith(defaultBaseUrl)
  expect(api.toast).toHaveBeenCalledWith({
    duration: 6_000,
    message: 'Logged out of tmm.',
    title: 'curl.md',
    variant: 'info',
  })
})

test('shows already logged out when no session exists', async () => {
  vi.spyOn(Session, 'read').mockReturnValue(null)
  const logoutSpy = vi.spyOn(Auth, 'logout')

  const api = createTuiApi()
  await mountTui(api.api)

  await findCommand(api.commands(), 'curlmd.logout').onSelect?.()

  expect(api.clear).toHaveBeenCalledTimes(1)
  expect(logoutSpy).not.toHaveBeenCalled()
  expect(api.toast).toHaveBeenCalledWith({
    duration: 6_000,
    message: 'Already logged out.',
    title: 'curl.md',
    variant: 'info',
  })
})

test('switches curl.md organization', async () => {
  const resolveAuth = vi.fn().mockResolvedValue({
    authorization: 'Bearer access-token',
    expires_at: null,
    organization_id: null,
  })
  vi.spyOn(Auth, 'createResolver').mockReturnValue(resolveAuth)
  vi.spyOn(Session, 'read').mockReturnValue({ organization_id: undefined })
  const sessionWrite = vi.spyOn(Session, 'write').mockImplementation(() => undefined)

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      if (url.pathname === '/api/auth/me') {
        return HttpResponse.json({
          account: {
            login: 'tmm',
            organizations: [{ id: 'org_123', login: 'acme' }],
          },
        })
      }
      if (url.pathname === '/api/orgs') {
        return HttpResponse.json({
          organizations: [{ id: 'org_123', login: 'acme' }],
        })
      }
      return passthrough()
    }),
  )

  const api = createTuiApi()
  await mountTui(api.api)

  await findCommand(api.commands(), 'curlmd.org').onSelect?.()

  expect(api.dialogSelect).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Switch organization' }),
  )

  const selectProps = api.lastDialogSelectProps()
  selectProps?.onSelect?.(selectProps.options[1]!)

  expect(sessionWrite).toHaveBeenCalledWith({ organization_id: 'org_123' }, defaultBaseUrl)
  expect(api.clear).toHaveBeenCalledTimes(1)
  expect(api.toast).toHaveBeenCalledWith({
    duration: 6_000,
    message: 'Switched organization to acme.',
    title: 'curl.md',
    variant: 'info',
  })
})

test('shows curl.md status', async () => {
  const resolveAuth = vi.fn().mockResolvedValue({
    authorization: 'Bearer access-token',
    expires_at: null,
    organization_id: 'org_123',
  })
  vi.spyOn(Auth, 'createResolver').mockReturnValue(resolveAuth)

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (url.origin !== new URL(defaultBaseUrl).origin) return passthrough()
      if (url.pathname === '/api/auth/me') {
        return HttpResponse.json({
          account: {
            login: 'tmm',
            organizations: [{ id: 'org_123', login: 'acme' }],
          },
        })
      }
      return passthrough()
    }),
  )

  const api = createTuiApi()
  await mountTui(api.api)

  await findCommand(api.commands(), 'curlmd.status').onSelect?.()

  expect(api.clear).toHaveBeenCalledTimes(1)
  expect(api.toast).toHaveBeenCalledWith(
    expect.objectContaining({
      duration: 10_000,
      message: expect.stringContaining('Auth: session (tmm)'),
      title: 'curl.md',
      variant: 'info',
    }),
  )
  expect(api.toast).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining('Organization: acme') }),
  )
})

function findCommand(
  commands: Array<{ onSelect?: () => Promise<void> | void; value?: string }>,
  value: string,
) {
  const command = commands.find((command) => command.value === value)
  if (!command) throw new Error(`Command not found: ${value}`)
  return command
}

function mountTui(api: Parameters<typeof tuiPlugin.tui>[0]) {
  return tuiPlugin.tui(api, undefined, {} as Parameters<typeof tuiPlugin.tui>[2])
}

function createTuiApi() {
  const clear = vi.fn()
  const dialogAlert = vi.fn((props: { message: string; title: string }) => props)
  let dialogSelectProps:
    | {
        onSelect?: (option: {
          title: string
          value: { id?: string; kind: string; label: string }
        }) => void
        options: Array<{ title: string; value: { id?: string; kind: string; label: string } }>
        placeholder?: string
        title: string
      }
    | undefined
  const dialogSelect = vi.fn(
    (props: {
      onSelect?: (option: {
        title: string
        value: { id?: string; kind: string; label: string }
      }) => void
      options: Array<{ title: string; value: { id?: string; kind: string; label: string } }>
      placeholder?: string
      title: string
    }) => {
      dialogSelectProps = props
      return props
    },
  )
  let commands: Array<{ onSelect?: () => Promise<void> | void; value?: string }> = []
  const register = vi.fn((cb: () => typeof commands) => {
    commands = cb()
    return vi.fn()
  })
  const replace = vi.fn((render: () => unknown) => render())
  const toast = vi.fn()

  return {
    api: {
      command: {
        register,
      },
      lifecycle: {
        onDispose: vi.fn(() => vi.fn()),
      },
      ui: {
        DialogAlert: dialogAlert,
        DialogSelect: dialogSelect,
        dialog: {
          clear,
          replace,
        },
        toast,
      },
    } as unknown as Parameters<typeof tuiPlugin.tui>[0],
    clear,
    commands: () => commands,
    dialogAlert,
    dialogSelect,
    lastDialogSelectProps: () => dialogSelectProps,
    register,
    replace,
    toast,
  }
}
