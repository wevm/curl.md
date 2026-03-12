import { hc } from 'hono/client'
import { Kysely } from 'kysely'
import {
  beforeEach,
  describe,
  expect,
  inject,
  onTestFinished,
  test,
  vi,
} from 'vitest'
import type { api } from '#api.ts'
import type { DB } from '#lib/db.gen.ts'
import { dialect } from '#lib/db.ts'
import * as Nanoid from '#lib/nanoid.ts'
import { Env } from '../../../test/env.ts'
import { createFactory } from '../../../test/factory.ts'
import { serve, useTempHome } from '../../test/cli.ts'
import * as utils from './utils.ts'
import { Session, UpdateCache } from './utils.ts'

const env = Env.parse(inject('env'))
const client = hc<typeof api>(env.CURLMD_BASE_URL)
const db = new Kysely<DB>({ dialect: dialect(env.DB_URL) })
const factory = createFactory(db)

let home: ReturnType<typeof useTempHome>
beforeEach(() => {
  home = useTempHome()
  return () => home.cleanup()
})

test('version', async () => {
  const { output } = await serve(['--version'])
  expect(output).toMatchInlineSnapshot(`
  	"x.y.z
  	"
  `)
})

test('help', async () => {
  const { output } = await serve(['--help'], { CURLMD_BASE_URL: undefined })
  expect(output).toMatchInlineSnapshot(`
    "curl.md@x.y.z — Fetch any URL as Markdown
    Aliases: md, curlmd

    Usage: curl.md <url> [options]

    Arguments:
      url  URL to fetch

    Options:
      --fresh, -f <boolean>     Force fresh fetch (bypass cache)
      --keywords, -k <array>    Pre-filter by keywords (comma-separated)
      --mode, -m <rush|smart>   Mode when narrowing content with --objective
      --objective, -o <string>  Narrow content to a specific objective
      --api-key <string>        API key for authentication (overrides CURLMD_API_KEY)

    Examples:
      curl.md example.com
      curl.md docs.github.com/en/webhooks/webhook-events-and-payloads --objective pull request webhook event payload and actions --keywords pull_request
      curl.md developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch --objective streaming response body --keywords ReadableStream,getReader
      curl.md developers.cloudflare.com/d1/get-started --objective how to query D1 from a worker --keywords D1,bindings
      curl.md ai-sdk.dev/docs/ai-sdk-core/generating-text --objective how to stream text with the ai sdk --keywords streamText,generateText
      curl.md zod.dev/error-formatting --objective tree error formatting --keywords treeifyError

    Commands:
      auth     Authentication commands (check, login, logout)
      credits  Manage prepaid credits (add, check)
      org      Manage organizations (create, invite, list, members, show, switch)
      token    Manage API tokens (create, list, delete)
      update   Update curl.md CLI

    Built-in Commands:
      completions  Generate shell completion script
      mcp add      Register as an MCP server
      skills add   Sync skill files to your agent

    Global Options:
      --filter-output <keys>              Filter output by key paths (e.g. foo,bar.baz,a[0,3])
      --format <toon|json|yaml|md|jsonl>  Output format
      --help                              Show help
      --llms, --llms-full                 Print LLM-readable manifest
      --mcp                               Start as MCP stdio server
      --schema                            Show JSON Schema for a command
      --token-count                       Print token count of output (instead of output)
      --token-limit <n>                   Limit output to n tokens
      --token-offset <n>                  Skip first n tokens of output
      --verbose                           Show full output envelope
      --version                           Show version

    Environment Variables:
      CURLMD_API_KEY   API key for authentication
      CURLMD_BASE_URL  Base URL (default: https://curl.md)
    "
  `)
})

describe('fetch', () => {
  test('fetch - markdown', async () => {
    const { output } = await serve(['example.com'])
    expect(output).toContain('Example Domain')
  }, 30_000)

  test('fetch - json', async () => {
    const { output } = await serve(['example.com', '--json'])
    const json = JSON.parse(output)
    const content = json.data ?? json.content ?? json
    expect(
      typeof content === 'string' ? content : JSON.stringify(content),
    ).toContain('Example Domain')
  }, 30_000)

  test('fetch - invalid url', async () => {
    const { exitCode, output } = await serve(['!!!invalid'])
    expect(exitCode).toBe(1)
    expect(output).toMatchInlineSnapshot(`
      "## code

      INVALID_URL

      ## message

      Invalid URL: !!!invalid

      ## cta.description

      URL must be a valid HTTP(S) address:

      ## cta.commands

      | command                          | description             |
      |----------------------------------|-------------------------|
      | curl.md example.com              | Domain without protocol |
      | curl.md https://example.com/path | Full URL with protocol  |
      "
    `)
  })

  test('fetch - missing url', async () => {
    const { exitCode, output } = await serve([])
    expect(exitCode).toBe(1)
    expect(output).toContain('VALIDATION_ERROR')
  })

  test('fetch - rate limit 429', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': '3600',
        },
      })
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { exitCode, output } = await serve(['example.com'])
    expect(exitCode).toBe(1)
    expect(output).toContain('RATE_LIMITED')
    expect(output).toContain('3600s')
  })

  test('fetch - rate limit 429 without retry-after', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { exitCode, output } = await serve(['example.com'])
    expect(exitCode).toBe(1)
    expect(output).toContain('RATE_LIMITED')
    expect(output).toContain('Try again later')
  })

  test('fetch - rate limit 429 login cta when unauthenticated', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { output } = await serve(['example.com'])
    expect(output).toContain('auth login')
  })

  test('fetch - rate limit 429 credits add cta when authenticated', async () => {
    Session.write({ session_id: 'test' })
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { output } = await serve(['example.com'])
    expect(output).toContain('credits add')
    expect(output).not.toContain('auth login')
  })

  test('fetch - invalid api key 401', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'invalid_api_key' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { exitCode, output } = await serve(['example.com'])
    expect(exitCode).toBe(1)
    expect(output).toContain('INVALID_API_KEY')
    expect(output).toContain('token create')
  })

  test('fetch - validation error 400', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: 'validation_error',
          issues: [{ path: 'url', message: 'Invalid url' }],
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { exitCode, output } = await serve(['example.com'])
    expect(exitCode).toBe(1)
    expect(output).toContain('VALIDATION_ERROR')
    expect(output).toContain('url')
  })

  test('fetch - fetch_failed 502', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: 'fetch_failed',
          message: 'Connection refused',
        }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      )
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { exitCode, output } = await serve(['example.com'])
    expect(exitCode).toBe(1)
    expect(output).toContain('FETCH_FAILED')
    expect(output).toContain('Connection refused')
  })

  test('fetch - unexpected 500', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response('Internal Server Error', { status: 500 })
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { exitCode, output } = await serve(['example.com'])
    expect(exitCode).toBe(1)
    expect(output).toContain('FETCH_FAILED')
  })

  test('fetch - objective cta shown for long responses', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response('x'.repeat(15_000), { status: 200 })
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { output } = await serve(['example.com', '--verbose'])
    expect(output).toContain('Narrow results with an objective')
  })

  test('fetch - objective cta hidden for short responses', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response('short content', { status: 200 })
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { output } = await serve(['example.com', '--verbose'])
    expect(output).not.toContain('Narrow results with an objective')
  })
})

describe('update check middleware', () => {
  test('no cache - spawns background check', async () => {
    const spy = vi.spyOn(UpdateCache, 'spawnCheck').mockImplementation(() => {})
    onTestFinished(() => spy.mockRestore())

    await serve(['auth', 'check'])
    expect(spy).toHaveBeenCalled()
  })

  test('stale cache - spawns background check', async () => {
    UpdateCache.write({
      checked_at: Date.now() - 2 * 60 * 60 * 1000,
      latest: '0.0.1',
      released_at: null,
    })
    const spy = vi.spyOn(UpdateCache, 'spawnCheck').mockImplementation(() => {})
    onTestFinished(() => spy.mockRestore())

    await serve(['auth', 'check'])
    expect(spy).toHaveBeenCalled()
  })

  test('fresh cache - skips background check', async () => {
    UpdateCache.write({
      checked_at: Date.now(),
      latest: '0.0.1',
      released_at: null,
    })
    const spy = vi.spyOn(UpdateCache, 'spawnCheck').mockImplementation(() => {})
    onTestFinished(() => spy.mockRestore())

    await serve(['auth', 'check'])
    expect(spy).not.toHaveBeenCalled()
  })

  test('newer version available - shows update command', async () => {
    UpdateCache.write({
      checked_at: Date.now(),
      latest: '99.0.0',
      released_at: null,
    })
    const spawnSpy = vi
      .spyOn(UpdateCache, 'spawnCheck')
      .mockImplementation(() => {})
    const compareSpy = vi.spyOn(utils, 'compareVersions').mockReturnValue(1)
    onTestFinished(() => {
      spawnSpy.mockRestore()
      compareSpy.mockRestore()
    })

    const { output } = await serve(['!!!invalid'])
    expect(output).toContain('curl.md update')
    expect(output).toContain('99.0.0')
  })

  test('newer version available - includes relative time', async () => {
    UpdateCache.write({
      checked_at: Date.now(),
      latest: '99.0.0',
      released_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    })
    const spawnSpy = vi
      .spyOn(UpdateCache, 'spawnCheck')
      .mockImplementation(() => {})
    const compareSpy = vi.spyOn(utils, 'compareVersions').mockReturnValue(1)
    onTestFinished(() => {
      spawnSpy.mockRestore()
      compareSpy.mockRestore()
    })

    const { output } = await serve(['!!!invalid'])
    expect(output).toContain('released 3h ago')
  })

  test('version is current - no update command', async () => {
    UpdateCache.write({
      checked_at: Date.now(),
      latest: '0.0.1',
      released_at: null,
    })
    const spawnSpy = vi
      .spyOn(UpdateCache, 'spawnCheck')
      .mockImplementation(() => {})
    const compareSpy = vi.spyOn(utils, 'compareVersions').mockReturnValue(0)
    onTestFinished(() => {
      spawnSpy.mockRestore()
      compareSpy.mockRestore()
    })

    const { output } = await serve(['!!!invalid'])
    expect(output).not.toContain('curl.md update')
  })
})

describe('auth', () => {
  test('check - not logged in', async () => {
    const { output } = await serve(['auth', 'check'])
    expect(output).toContain('You are not authenticated')
  })

  test('logout - not logged in', async () => {
    const { output } = await serve(['auth', 'logout'])
    expect(output).toContain('Already logged out')
  })

  test('logout - deletes session', async () => {
    Session.write({ session_id: 'test' })

    // Simulate pressing Enter
    setTimeout(() => process.stdin.emit('data', '\n'), 100)
    const { output } = await serve(['auth', 'logout'])
    expect(output).toContain('Successfully logged out')
    expect(Session.read()).toBeNull()
  })

  test('check - expired session', async () => {
    Session.write({ session_id: 'expired-session-id' })

    const { output } = await serve(['auth', 'check'])
    expect(output).toContain('You are not authenticated')
    expect(Session.read()).toBeNull()
  })

  test('login - already authenticated', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const { exitCode, output } = await serve(['auth', 'login'])
    expect(exitCode).toBe(1)
    expect(output).toContain('ALREADY_LOGGED_IN')
  })

  test('login - expired device code', async () => {
    vi.mock('node:child_process', () => ({
      default: { exec: vi.fn(), spawn: vi.fn(() => ({ unref: vi.fn() })) },
      exec: vi.fn(),
      spawn: vi.fn(() => ({ unref: vi.fn() })),
    }))

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    onTestFinished(() => consoleSpy.mockRestore())

    const originalFetch = globalThis.fetch
    let callCount = 0
    globalThis.fetch = async () => {
      callCount++
      // First call: POST /api/auth/device
      if (callCount === 1)
        return new Response(
          JSON.stringify({
            code: 'test-code',
            interval: 0,
            user_code: 'TESTCODE',
            verification_uri: 'https://curl.local/auth/device',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      // Second call: POST /api/auth/device/token
      return new Response(JSON.stringify({ error: 'expired_token' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { exitCode, output } = await serve(['auth', 'login'])
    expect(exitCode).toBe(1)
    expect(output).toContain('AUTH_FAILED')
  })

  test('login - malformed token request', async () => {
    vi.mock('node:child_process', () => ({
      default: { exec: vi.fn(), spawn: vi.fn(() => ({ unref: vi.fn() })) },
      exec: vi.fn(),
      spawn: vi.fn(() => ({ unref: vi.fn() })),
    }))

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    onTestFinished(() => consoleSpy.mockRestore())

    const originalFetch = globalThis.fetch
    let callCount = 0
    globalThis.fetch = async () => {
      callCount++
      if (callCount === 1)
        return new Response(
          JSON.stringify({
            code: 'test-code',
            interval: 0,
            user_code: 'TESTCODE',
            verification_uri: 'https://curl.local/auth/device',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      return new Response(
        JSON.stringify({
          error: 'validation_error',
          issues: [{ path: 'code', message: 'Required' }],
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { exitCode, output } = await serve(['auth', 'login'])
    expect(exitCode).toBe(1)
    expect(output).toContain('AUTH_FAILED')
    expect(output).toContain('code')
  })

  test('login - rate limit on device request', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': '30',
        },
      })
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { exitCode, output } = await serve(['auth', 'login'])
    expect(exitCode).toBe(1)
    expect(output).toContain('RATE_LIMITED')
    expect(output).toContain('30s')
  })

  test('login - rate limit on token polling', async () => {
    vi.mock('node:child_process', () => ({
      default: { exec: vi.fn(), spawn: vi.fn(() => ({ unref: vi.fn() })) },
      exec: vi.fn(),
      spawn: vi.fn(() => ({ unref: vi.fn() })),
    }))

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    onTestFinished(() => consoleSpy.mockRestore())

    const originalFetch = globalThis.fetch
    let callCount = 0
    globalThis.fetch = async () => {
      callCount++
      if (callCount === 1)
        return new Response(
          JSON.stringify({
            code: 'test-code',
            interval: 0,
            user_code: 'TESTCODE',
            verification_uri: 'https://curl.local/auth/device',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      return new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    }
    onTestFinished(() => {
      globalThis.fetch = originalFetch
    })

    const { exitCode, output } = await serve(['auth', 'login'])
    expect(exitCode).toBe(1)
    expect(output).toContain('RATE_LIMITED')
    expect(output).toContain('Try again later')
  })

  test('login - full device flow', async () => {
    vi.mock('node:child_process', () => ({
      default: { exec: vi.fn(), spawn: vi.fn(() => ({ unref: vi.fn() })) },
      exec: vi.fn(),
      spawn: vi.fn(() => ({ unref: vi.fn() })),
    }))

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    onTestFinished(() => consoleSpy.mockRestore())

    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })

    const loginPromise = serve(['auth', 'login'])

    const deviceCode = await vi.waitFor(() =>
      db
        .selectFrom('device_code')
        .where('status', '=', 'pending')
        .select(['user_code', 'id'])
        .orderBy('created_at', 'desc')
        .executeTakeFirstOrThrow(),
    )

    await client.api.auth.device.confirm.$post(
      { json: { user_code: deviceCode.user_code } },
      { headers: { Authorization: `Bearer ${session.id}` } },
    )

    const { output } = await loginPromise
    expect(output).toContain('Successfully logged in')
    expect(Session.read()).not.toBeNull()

    const { output: checkOutput } = await serve(['auth', 'check'])
    expect(checkOutput).toContain('You are authenticated')
  })
})

describe('credits', () => {
  test('check - requires auth', async () => {
    const { exitCode, output } = await serve(['credits', 'check'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
  })

  test('check - expired session deletes session', async () => {
    Session.write({ session_id: 'expired-session-id' })
    const { exitCode, output } = await serve(['credits', 'check'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('check - shows balance', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await db
      .updateTable('account')
      .set({ balance_mills: 12500 })
      .where('id', '=', account.id)
      .execute()
    Session.write({ session_id: session.id })

    const { output } = await serve(['credits', 'check'])
    expect(output).toContain('$12.500')
  })

  test('check - zero balance', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const { output } = await serve(['credits', 'check'])
    expect(output).toContain('$0.000')
  })

  test('add - requires auth', async () => {
    const { exitCode, output } = await serve(['credits', 'add', '500'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
  })

  test('add - browser flow (no saved card)', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const openUrlSpy = vi.spyOn(utils, 'openUrl').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    let creditsCallCount = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = input.toString()

      // GET /api/credits — first call: no saved card, subsequent: updated balance
      if (
        url.includes('/api/credits') &&
        !url.includes('/add') &&
        !url.includes('/charge') &&
        !url.includes('/payment')
      ) {
        creditsCallCount++
        return new Response(
          JSON.stringify({
            balance_mills: creditsCallCount <= 1 ? 0 : 10_000,
            payment_method: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      // POST /api/credits/add
      if (url.includes('/api/credits/add') && init?.method === 'POST')
        return new Response(
          JSON.stringify({
            url: 'https://curl.local/credits/add/pay_test',
            payment_id: 'pay_test',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )

      return originalFetch(input, init)
    }

    onTestFinished(() => {
      openUrlSpy.mockRestore()
      consoleLogSpy.mockRestore()
      globalThis.fetch = originalFetch
    })

    const { output } = await serve(['credits', 'add', '1000'])
    expect(openUrlSpy).toHaveBeenCalledWith(
      'https://curl.local/credits/add/pay_test',
    )
    expect(output).toContain('Credits added')
    expect(output).toContain('$10.000')
  })

  test('add - charges saved card', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const selectSpy = vi.spyOn(utils, 'select').mockResolvedValue(0)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    let creditsCallCount = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = input.toString()

      // GET /api/credits
      if (
        url.includes('/api/credits') &&
        !url.includes('/add') &&
        !url.includes('/charge') &&
        !url.includes('/payment')
      ) {
        creditsCallCount++
        return new Response(
          JSON.stringify({
            balance_mills: creditsCallCount <= 1 ? 5_000 : 15_000,
            payment_method: { brand: 'visa', last4: '4242' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      // POST /api/credits/charge
      if (url.includes('/api/credits/charge') && init?.method === 'POST')
        return new Response(
          JSON.stringify({ payment_id: 'pi_test', status: 'succeeded' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )

      return originalFetch(input, init)
    }

    onTestFinished(() => {
      selectSpy.mockRestore()
      consoleLogSpy.mockRestore()
      globalThis.fetch = originalFetch
    })

    const { output } = await serve(['credits', 'add', '1000'])
    expect(selectSpy).toHaveBeenCalled()
    expect(output).toContain('Credits added')
    expect(output).toContain('$15.000')
  })

  test('add - falls back to browser on requires_action', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const selectSpy = vi.spyOn(utils, 'select').mockResolvedValue(0)
    const openUrlSpy = vi.spyOn(utils, 'openUrl').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    let creditsCallCount = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = input.toString()

      // GET /api/credits
      if (
        url.includes('/api/credits') &&
        !url.includes('/add') &&
        !url.includes('/charge') &&
        !url.includes('/payment')
      ) {
        creditsCallCount++
        return new Response(
          JSON.stringify({
            balance_mills: creditsCallCount <= 1 ? 5_000 : 15_000,
            payment_method: { brand: 'visa', last4: '4242' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      // POST /api/credits/charge → requires_action
      if (url.includes('/api/credits/charge') && init?.method === 'POST')
        return new Response(
          JSON.stringify({
            payment_id: 'pay_3ds',
            status: 'requires_action',
            url: 'https://curl.local/credits/add/pay_3ds',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )

      return originalFetch(input, init)
    }

    onTestFinished(() => {
      selectSpy.mockRestore()
      openUrlSpy.mockRestore()
      consoleLogSpy.mockRestore()
      globalThis.fetch = originalFetch
    })

    const { output } = await serve(['credits', 'add', '1000'])
    expect(openUrlSpy).toHaveBeenCalledWith(
      'https://curl.local/credits/add/pay_3ds',
    )
    expect(output).toContain('Credits added')
    expect(output).toContain('$15.000')
  })

  test('add - user selects new payment method', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const selectSpy = vi.spyOn(utils, 'select').mockResolvedValue(2)
    const openUrlSpy = vi.spyOn(utils, 'openUrl').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    let creditsCallCount = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = input.toString()

      // GET /api/credits
      if (
        url.includes('/api/credits') &&
        !url.includes('/add') &&
        !url.includes('/charge') &&
        !url.includes('/payment')
      ) {
        creditsCallCount++
        return new Response(
          JSON.stringify({
            balance_mills: creditsCallCount <= 1 ? 5_000 : 15_000,
            payment_method: { brand: 'visa', last4: '4242' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      // POST /api/credits/add
      if (url.includes('/api/credits/add') && init?.method === 'POST')
        return new Response(
          JSON.stringify({
            url: 'https://curl.local/credits/add/pay_new',
            payment_id: 'pay_new',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )

      return originalFetch(input, init)
    }

    onTestFinished(() => {
      selectSpy.mockRestore()
      openUrlSpy.mockRestore()
      consoleLogSpy.mockRestore()
      globalThis.fetch = originalFetch
    })

    const { output } = await serve(['credits', 'add', '1000'])
    expect(openUrlSpy).toHaveBeenCalledWith(
      'https://curl.local/credits/add/pay_new',
    )
    expect(output).toContain('Credits added')
    expect(output).toContain('$15.000')
  })

  test('add - expired session deletes session', async () => {
    Session.write({ session_id: 'expired-session-id' })
    const { exitCode, output } = await serve(['credits', 'add', '500'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })
})

describe('org', () => {
  test('list - requires auth', async () => {
    const { exitCode, output } = await serve(['org', 'list'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
  })

  test('list - shows personal when no orgs', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const { output } = await serve(['org', 'list'])
    expect(output).toContain('personal')
  })

  test('show - defaults to personal', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const { output } = await serve(['org', 'show'])
    expect(output).toContain('personal')
  })

  test('create, list, switch, show - full flow', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const login = `test-org${Nanoid.generate()}`
    const { output: createOutput } = await serve([
      'org',
      'create',
      login,
      '--name',
      'Test Org',
    ])
    expect(createOutput).toContain(`Created organization ${login}`)

    const { output: listOutput } = await serve(['org', 'list'])
    expect(listOutput).toContain(login)
    expect(listOutput).toContain('personal')

    const { output: switchOutput } = await serve(['org', 'switch', login])
    expect(switchOutput).toContain(`Switched to ${login}`)

    const { output: showOutput } = await serve(['org', 'show'])
    expect(showOutput).toContain(login)

    const { output: switchBackOutput } = await serve([
      'org',
      'switch',
      'personal',
    ])
    expect(switchBackOutput).toContain('Switched to personal')
  })

  test('create - invalid login', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const { exitCode, output } = await serve(['org', 'create', '!'])
    expect(exitCode).toBe(1)
    expect(output).toContain('VALIDATION_ERROR')
    expect(output).toContain('login')
  })

  test('create - duplicate login', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const login = `dup-org${Nanoid.generate()}`
    await serve(['org', 'create', login])
    const { exitCode, output } = await serve(['org', 'create', login])
    expect(exitCode).toBe(1)
    expect(output).toContain('CREATE_FAILED')
  })

  test('create - expired session deletes session', async () => {
    Session.write({ session_id: 'expired-session-id' })

    const { exitCode, output } = await serve(['org', 'create', 'my-org'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('list - expired session deletes session', async () => {
    Session.write({ session_id: 'expired-session-id' })

    const { exitCode, output } = await serve(['org', 'list'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('show - expired session deletes session', async () => {
    Session.write({
      session_id: 'expired-session-id',
      organization_id: 'stale',
    })

    const { exitCode, output } = await serve(['org', 'show'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('switch - expired session deletes session', async () => {
    Session.write({ session_id: 'expired-session-id' })

    const { exitCode, output } = await serve(['org', 'switch', 'some-org'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('switch - nonexistent org', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const { exitCode, output } = await serve([
      'org',
      'switch',
      'nonexistent-org',
    ])
    expect(exitCode).toBe(1)
    expect(output).toContain('ORG_NOT_FOUND')
  })

  test('list - stale org resets to personal', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    Session.write({ session_id: session.id, organization_id: org.id })

    const { output } = await serve(['org', 'list'])
    expect(output).toContain('no longer accessible')
    expect(Session.read()?.organization_id).toBeUndefined()
  })

  test('show - stale org resets to personal', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    Session.write({ session_id: session.id, organization_id: org.id })

    const { output } = await serve(['org', 'show'])
    expect(output).toContain('no longer accessible')
    expect(Session.read()?.organization_id).toBeUndefined()
  })

  test('fetch - stale org cleared on 403', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    Session.write({ session_id: session.id, organization_id: org.id })

    const { exitCode, output } = await serve(['example.com'])
    expect(exitCode).toBe(1)
    expect(output).toContain('no longer accessible')
    expect(Session.read()?.organization_id).toBeUndefined()
  })
})

describe('org invite', () => {
  describe('accept', () => {
    test('accepts invite', async () => {
      const owner = await factory.account.insert({})
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      const invite = await factory.organization_invite.insert({
        organization_id: org.id,
        created_by: owner.id,
      })

      const invitee = await factory.account.insert({})
      const inviteeSession = await factory.session.insert({
        account_id: invitee.id,
      })
      Session.write({ session_id: inviteeSession.id })

      const { output } = await serve(['org', 'invite', 'accept', invite.token])
      expect(output).toContain('Joined')
      expect(output).toContain(org.login)
      expect(output).toContain('org switch')
    })

    test('accepts invite from URL', async () => {
      const owner = await factory.account.insert({})
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      const invite = await factory.organization_invite.insert({
        organization_id: org.id,
        created_by: owner.id,
      })

      const invitee = await factory.account.insert({})
      const inviteeSession = await factory.session.insert({
        account_id: invitee.id,
      })
      Session.write({ session_id: inviteeSession.id })

      const { output } = await serve([
        'org',
        'invite',
        'accept',
        `https://curl.md/invite/${invite.token}`,
      ])
      expect(output).toContain('Joined')
    })

    test('expired session deletes session', async () => {
      Session.write({ session_id: 'expired-session-id' })

      const { exitCode, output } = await serve([
        'org',
        'invite',
        'accept',
        'some-token',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_AUTHENTICATED')
      expect(Session.read()).toBeNull()
    })

    test('not found', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      Session.write({ session_id: session.id })

      const { exitCode, output } = await serve([
        'org',
        'invite',
        'accept',
        'fake-token',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_FOUND')
    })

    test('already member', async () => {
      const owner = await factory.account.insert({})
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      const invite = await factory.organization_invite.insert({
        organization_id: org.id,
        created_by: owner.id,
      })

      const invitee = await factory.account.insert({})
      const inviteeSession = await factory.session.insert({
        account_id: invitee.id,
      })
      Session.write({ session_id: inviteeSession.id })

      await serve(['org', 'invite', 'accept', invite.token])

      const { exitCode, output } = await serve([
        'org',
        'invite',
        'accept',
        invite.token,
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('ALREADY_MEMBER')
    })
  })

  describe('create', () => {
    test('requires auth', async () => {
      const { exitCode, output } = await serve(['org', 'invite', 'create'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_AUTHENTICATED')
    })

    test('expired session deletes session', async () => {
      Session.write({
        session_id: 'expired-session-id',
        organization_id: 'stale',
      })

      const { exitCode, output } = await serve(['org', 'invite', 'create'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_AUTHENTICATED')
      expect(Session.read()).toBeNull()
    })

    test('requires active org', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      Session.write({ session_id: session.id })

      const { exitCode, output } = await serve(['org', 'invite', 'create'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_ACTIVE_ORG')
    })

    test('creates invite', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: account.id,
        role: 'owner',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { output } = await serve(['org', 'invite', 'create'])
      expect(output).toContain('Invite created')
      expect(output).toContain('/invite/')
    })

    test('with custom options', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: account.id,
        role: 'owner',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { output } = await serve([
        'org',
        'invite',
        'create',
        '--role',
        'admin',
        '--max-uses',
        '5',
      ])
      expect(output).toContain('admin')
    })

    test('forbidden (regular member)', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: account.id,
        role: 'member',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { exitCode, output } = await serve(['org', 'invite', 'create'])
      expect(exitCode).toBe(1)
      expect(output).toContain('FORBIDDEN')
    })
  })

  describe('list', () => {
    test('requires active org', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      Session.write({ session_id: session.id })

      const { exitCode, output } = await serve(['org', 'invite', 'list'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_ACTIVE_ORG')
    })

    test('expired session deletes session', async () => {
      Session.write({
        session_id: 'expired-session-id',
        organization_id: 'stale',
      })

      const { exitCode, output } = await serve(['org', 'invite', 'list'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_AUTHENTICATED')
      expect(Session.read()).toBeNull()
    })

    test('forbidden (regular member)', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: account.id,
        role: 'member',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { exitCode, output } = await serve(['org', 'invite', 'list'])
      expect(exitCode).toBe(1)
      expect(output).toContain('FORBIDDEN')
    })

    test('empty list', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: account.id,
        role: 'owner',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { output } = await serve(['org', 'invite', 'list'])
      expect(output).toContain('No invites found')
    })

    test('lists invites', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: account.id,
        role: 'owner',
      })
      const invite = await factory.organization_invite.insert({
        organization_id: org.id,
        created_by: account.id,
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { output } = await serve(['org', 'invite', 'list'])
      expect(output).toContain(invite.token.slice(0, 12))
    })
  })

  describe('revoke', () => {
    test('requires active org', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      Session.write({ session_id: session.id })

      const { exitCode, output } = await serve([
        'org',
        'invite',
        'revoke',
        'some-id',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_ACTIVE_ORG')
    })

    test('expired session deletes session', async () => {
      Session.write({
        session_id: 'expired-session-id',
        organization_id: 'stale',
      })

      const { exitCode, output } = await serve([
        'org',
        'invite',
        'revoke',
        'some-id',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_AUTHENTICATED')
      expect(Session.read()).toBeNull()
    })

    test('no invites to revoke', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: account.id,
        role: 'owner',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { exitCode, output } = await serve(['org', 'invite', 'revoke'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_INVITES')
    })

    test('revokes invite by id', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: account.id,
        role: 'owner',
      })
      const invite = await factory.organization_invite.insert({
        organization_id: org.id,
        created_by: account.id,
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { output } = await serve(['org', 'invite', 'revoke', invite.id])
      expect(output).toContain('revoked')
    })

    test('not found', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: account.id,
        role: 'owner',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { exitCode, output } = await serve([
        'org',
        'invite',
        'revoke',
        'fake-id',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_FOUND')
    })
  })
})

describe('org member', () => {
  describe('add', () => {
    test('requires active org', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      Session.write({ session_id: session.id })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'add',
        'someone',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_ACTIVE_ORG')
    })

    test('expired session deletes session', async () => {
      Session.write({
        session_id: 'expired-session-id',
        organization_id: 'stale',
      })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'add',
        'someone',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_AUTHENTICATED')
      expect(Session.read()).toBeNull()
    })

    test('adds member', async () => {
      const owner = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: owner.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      const target = await factory.account.insert({})
      Session.write({ session_id: session.id, organization_id: org.id })

      const { output } = await serve(['org', 'member', 'add', target.login])
      expect(output).toContain('Added')
      expect(output).toContain(target.login)

      const { output: listOutput } = await serve(['org', 'member', 'list'])
      expect(listOutput).toContain(owner.login)
      expect(listOutput).toContain(target.login)
    })

    test('adds member as admin (owner)', async () => {
      const owner = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: owner.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      const target = await factory.account.insert({})
      Session.write({ session_id: session.id, organization_id: org.id })

      const { output } = await serve([
        'org',
        'member',
        'add',
        target.login,
        '--role',
        'admin',
      ])
      expect(output).toContain('Added')
      expect(output).toContain('admin')
    })

    test('forbidden (regular member)', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: account.id,
        role: 'member',
      })
      const target = await factory.account.insert({})
      Session.write({ session_id: session.id, organization_id: org.id })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'add',
        target.login,
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('FORBIDDEN')
    })

    test('forbidden (admin assigns admin)', async () => {
      const admin = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: admin.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: admin.id,
        role: 'admin',
      })
      const target = await factory.account.insert({})
      Session.write({ session_id: session.id, organization_id: org.id })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'add',
        target.login,
        '--role',
        'admin',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('FORBIDDEN')
    })

    test('account not found', async () => {
      const owner = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: owner.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'add',
        'nonexistent-login',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_FOUND')
    })

    test('already member', async () => {
      const owner = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: owner.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      const target = await factory.account.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: target.id,
        role: 'member',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'add',
        target.login,
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('ALREADY_MEMBER')
    })
  })

  describe('list', () => {
    test('requires active org', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      Session.write({ session_id: session.id })

      const { exitCode, output } = await serve(['org', 'member', 'list'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_ACTIVE_ORG')
    })

    test('expired session deletes session', async () => {
      Session.write({
        session_id: 'expired-session-id',
        organization_id: 'stale',
      })

      const { exitCode, output } = await serve(['org', 'member', 'list'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_AUTHENTICATED')
      expect(Session.read()).toBeNull()
    })

    test('forbidden (regular member)', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: account.id,
        role: 'member',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { exitCode, output } = await serve(['org', 'member', 'list'])
      expect(exitCode).toBe(1)
      expect(output).toContain('FORBIDDEN')
    })

    test('lists members', async () => {
      const owner = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: owner.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { output } = await serve(['org', 'member', 'list'])
      expect(output).toContain(owner.login)
    })

    test('empty list', async () => {
      const owner = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: owner.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { output } = await serve(['org', 'member', 'list'])
      expect(output).toContain(owner.login)
    })
  })

  describe('remove', () => {
    test('requires active org', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      Session.write({ session_id: session.id })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'remove',
        'someone',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_ACTIVE_ORG')
    })

    test('expired session deletes session', async () => {
      Session.write({
        session_id: 'expired-session-id',
        organization_id: 'stale',
      })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'remove',
        'someone',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_AUTHENTICATED')
      expect(Session.read()).toBeNull()
    })

    test('removes member by login', async () => {
      const owner = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: owner.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      const target = await factory.account.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: target.id,
        role: 'member',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { output } = await serve(['org', 'member', 'remove', target.login])
      expect(output).toContain('Removed')
    })

    test('forbidden - cannot remove owner', async () => {
      const owner = await factory.account.insert({})
      const admin = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: admin.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: admin.id,
        role: 'admin',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'remove',
        owner.login,
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('FORBIDDEN')
      expect(output).toContain('Cannot remove an owner')
    })

    test('not found', async () => {
      const owner = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: owner.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'remove',
        'nonexistent-login',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_FOUND')
      expect(output).toContain('not found')
    })
  })

  describe('role', () => {
    test('requires active org', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      Session.write({ session_id: session.id })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'role',
        'someone',
        '--role',
        'admin',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_ACTIVE_ORG')
    })

    test('expired session deletes session', async () => {
      Session.write({
        session_id: 'expired-session-id',
        organization_id: 'stale',
      })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'role',
        'someone',
        '--role',
        'admin',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_AUTHENTICATED')
      expect(Session.read()).toBeNull()
    })

    test('changes role', async () => {
      const owner = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: owner.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      const target = await factory.account.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: target.id,
        role: 'member',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { output } = await serve([
        'org',
        'member',
        'role',
        target.login,
        '--role',
        'admin',
      ])
      expect(output).toContain('Changed')
      expect(output).toContain('admin')
    })

    test('admin changes member role', async () => {
      const owner = await factory.account.insert({})
      const admin = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: admin.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: admin.id,
        role: 'admin',
      })
      const target = await factory.account.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: target.id,
        role: 'member',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { output } = await serve([
        'org',
        'member',
        'role',
        target.login,
        '--role',
        'admin',
      ])
      expect(output).toContain('Changed')
      expect(output).toContain('admin')
    })

    test('admin changes other admin role', async () => {
      const owner = await factory.account.insert({})
      const admin = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: admin.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: admin.id,
        role: 'admin',
      })
      const otherAdmin = await factory.account.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: otherAdmin.id,
        role: 'admin',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { output } = await serve([
        'org',
        'member',
        'role',
        otherAdmin.login,
        '--role',
        'member',
      ])
      expect(output).toContain('Changed')
      expect(output).toContain('member')
    })

    test('forbidden (regular member)', async () => {
      const owner = await factory.account.insert({})
      const member = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: member.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: member.id,
        role: 'member',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'role',
        owner.login,
        '--role',
        'admin',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('FORBIDDEN')
    })

    test('cannot change owner role', async () => {
      const owner = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: owner.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: owner.id,
        role: 'owner',
      })
      const otherOwner = await factory.account.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: otherOwner.id,
        role: 'owner',
      })
      Session.write({ session_id: session.id, organization_id: org.id })

      const { exitCode, output } = await serve([
        'org',
        'member',
        'role',
        otherOwner.login,
        '--role',
        'admin',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('FORBIDDEN')
      expect(output).toContain('Cannot change owner role')
    })
  })
})

describe('token', () => {
  test('list - requires auth', async () => {
    const { exitCode, output } = await serve(['token', 'list'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
  })

  test('create, list - full flow', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const { output: createOutput } = await serve([
      'token',
      'create',
      'my-token',
    ])
    expect(createOutput).toContain('Token created: my-token')
    expect(createOutput).toContain('curl_')
    expect(createOutput).toContain("won't be shown again")

    const { output: listOutput } = await serve(['token', 'list'])
    expect(listOutput).toContain('my-token')
    expect(listOutput).toContain('curl_')
    expect(listOutput).toContain('never')
  })

  test('create - duplicate name', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    await serve(['token', 'create', 'dupe'])
    const { exitCode, output } = await serve(['token', 'create', 'dupe'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NAME_TAKEN')
    expect(output).toContain('dupe')
  })

  test('list - empty', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const { output } = await serve(['token', 'list'])
    expect(output).toContain('No tokens found')
  })

  test('list - expired session deletes session', async () => {
    Session.write({ session_id: 'expired-session-id' })

    const { exitCode, output } = await serve(['token', 'list'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('create - expired session deletes session', async () => {
    Session.write({ session_id: 'expired-session-id' })

    const { exitCode, output } = await serve(['token', 'create', 'test'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('delete - expired session deletes session', async () => {
    Session.write({ session_id: 'expired-session-id' })

    const { exitCode, output } = await serve(['token', 'delete', 'test'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('delete - nonexistent token', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    await serve(['token', 'create', 'exists'])
    const { exitCode, output } = await serve(['token', 'delete', 'nope'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_FOUND')
  })

  test('delete - success', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    await serve(['token', 'create', 'to-delete'])

    setTimeout(() => process.stdin.emit('data', '\n'), 100)
    const { output } = await serve(['token', 'delete', 'to-delete'])
    expect(output).toContain('Token deleted')

    const { output: listOutput } = await serve(['token', 'list'])
    expect(listOutput).toContain('No tokens found')
  })

  test('delete - no tokens', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    Session.write({ session_id: session.id })

    const { exitCode, output } = await serve(['token', 'delete', 'nope'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NO_TOKENS')
  })
})

describe('update', () => {
  test('update - install fails', async () => {
    const standaloneSpy = vi.spyOn(utils, 'isStandalone').mockReturnValue(false)
    const spy = vi
      .spyOn(utils, 'installGlobal')
      .mockRejectedValue(new Error('permission denied'))
    onTestFinished(() => {
      standaloneSpy.mockRestore()
      spy.mockRestore()
    })

    const { exitCode, output } = await serve(['update', '--target', '99.0.0'])
    expect(exitCode).toBe(1)
    expect(output).toContain('UPDATE_FAILED')
    expect(output).toContain('permission denied')
  })

  test('update - standalone download failure', async () => {
    const standaloneSpy = vi.spyOn(utils, 'isStandalone').mockReturnValue(true)
    const updateSpy = vi
      .spyOn(utils, 'updateStandalone')
      .mockRejectedValue(new Error('Download failed (404)'))
    onTestFinished(() => {
      standaloneSpy.mockRestore()
      updateSpy.mockRestore()
    })

    const { exitCode, output } = await serve(['update', '--target', '99.0.0'])
    expect(exitCode).toBe(1)
    expect(output).toContain('UPDATE_FAILED')
    expect(output).toContain('Download failed')
  })

  test('update - already up to date', async () => {
    const spy = vi.spyOn(utils, 'compareVersions').mockReturnValue(0)
    onTestFinished(() => spy.mockRestore())

    const { output } = await serve(['update', '--target', '0.0.1'])
    expect(output).toContain('Already up-to-date')
  })

  test('update - cannot determine latest version', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error())
    onTestFinished(() => fetchSpy.mockRestore())

    const { exitCode, output } = await serve(['update'])
    expect(exitCode).toBe(1)
    expect(output).toContain('UPDATE_FAILED')
    expect(output).toContain('Could not determine latest version')
  })
})
