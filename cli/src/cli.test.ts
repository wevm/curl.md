import { HttpResponse, http, passthrough } from 'msw'
import pc from 'picocolors'
import { afterAll, beforeEach, describe, expect, inject, onTestFinished, test, vi } from 'vitest'
import { createClient } from '#db/client.ts'
import type { DB } from '#db/types.gen.ts'
import * as ApiKey from '#lib/apiKey.ts'
import * as Nanoid from '#lib/nanoid.ts'
import * as SessionToken from '#lib/sessionToken.ts'
import { Env } from '#test/env.ts'
import { createFactory } from '#test/factory.ts'
import { server } from '../test/server.ts'
import { serve, useTmp } from '../test/utils.ts'
import { createClient as createRpcClient, defaultBaseUrl } from './client.ts'
import { Auth } from './internal/auth.ts'
import { Session } from './internal/session.ts'
import * as UI from './ui.ts'
import * as utils from './utils.ts'
import { UpdateCache } from './utils.ts'

// Prevent CLI from opening a browser during login tests
vi.mock('node:child_process', () => ({
  default: { exec: vi.fn(), spawn: vi.fn(() => ({ unref: vi.fn() })) },
  exec: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}))

const env = Env.parse(inject('env'))
const db = createClient(env.DB_URL)
const factory = createFactory(db)
const baseUrl = new URL(env.CURLMD_BASE_URL)

beforeEach(() => {
  server.resetHandlers()
  const tmp = useTmp()
  return () => tmp.cleanup()
})

afterAll(() => db.destroy())

test('createClient defaults to curl.md', () => {
  const client = createRpcClient()
  expect(client.api.auth.me.$url().toString()).toBe(`${defaultBaseUrl}/api/auth/me`)
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
    "curl.md@x.y.z — URL to markdown for agents

    Usage: curl.md <url> [options]
    Aliases: md, curlmd

    Arguments:
      url  URL to fetch

    Options:
      --fresh, -f               Force fresh fetch (bypass cache)
      --keywords, -k <array>    Pre-filter by keywords (comma-separated)
      --mode, -m <rush|smart>   Mode when narrowing content with --objective (default: smart)
      --objective, -o <string>  Narrow content to a specific objective
      --token, -t <string>      API token for authentication (env: CURLMD_API_KEY)

    Examples:
      curl.md example.com
      curl.md docs.github.com/en/webhooks/webhook-events-and-payloads --objective pull request webhook event payload and actions --keywords pull_request
      curl.md developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch --objective streaming response body --keywords ReadableStream,getReader
      curl.md developers.cloudflare.com/d1/get-started --objective how to query D1 from a worker --keywords D1,bindings
      curl.md ai-sdk.dev/docs/ai-sdk-core/generating-text --objective how to stream text with the ai sdk --keywords streamText,generateText
      curl.md zod.dev/error-formatting --objective tree error formatting --keywords treeifyError

    Commands:
      auth     Authenticate with curl.md (login, logout, status)
      credits  Manage prepaid credits (add, status)
      fetch    Fetch URL as markdown
      org      Manage organizations (create, invite, list, member, switch, view)
      request  Manage requests (list, view)
      token    Manage API tokens (create, list, delete)
      update   Update curl.md CLI

    Integrations:
      completions  Generate shell completion script
      mcp add      Register as MCP server
      skills       Sync skill files to agents (add, list)

    Global Options:
      --filter-output <keys>              Filter output by key paths (e.g. foo,bar.baz,a[0,3])
      --format <toon|json|yaml|md|jsonl>  Output format
      --full-output                       Show full output envelope
      --help                              Show help
      --llms, --llms-full                 Print LLM-readable manifest
      --mcp                               Start as MCP stdio server
      --schema                            Show JSON Schema for command
      --token-count                       Print token count of output (instead of output)
      --token-limit <n>                   Limit output to n tokens
      --token-offset <n>                  Skip first n tokens of output
      --version                           Show version

    Environment Variables:
      CURLMD_API_KEY   API token for authentication
      CURLMD_BASE_URL  Base URL (default: https://curl.md)
    "
  `)
})

test('markdown', async () => {
  const account = await factory.account.insert({})
  const suffix = Nanoid.generate()
  const token = `curlmd_${suffix}`
  await factory.api_key.insert({
    account_id: account.id,
    key_hash: await ApiKey.hash(token),
    key_prefix: token.slice(0, 9),
    name: `test-${suffix}`,
  })
  const { output } = await serve(['example.com'], { CURLMD_API_KEY: token })
  expect(output).toContain('Example Domain')
}, 30_000)

test('markdown with --token', async () => {
  const account = await factory.account.insert({})
  const suffix = Nanoid.generate()
  const token = `curlmd_${suffix}`
  await factory.api_key.insert({
    account_id: account.id,
    key_hash: await ApiKey.hash(token),
    key_prefix: token.slice(0, 9),
    name: `cli-token-test-${suffix}`,
  })

  const origArgv = process.argv
  process.argv = [...origArgv, '--token', token]
  onTestFinished(() => {
    process.argv = origArgv
  })

  const { output } = await serve(['example.com', '--token', token])
  expect(output).toContain('Example Domain')
}, 30_000)

test('markdown falls back to anon when saved session is stale', async () => {
  Session.write({
    organization_id: 'stale-org',
    refresh_token: 'stale-refresh-token',
    refresh_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
  })

  const { output } = await serve(['example.com'])
  expect(output).toContain('Example Domain')
  expect(Session.read()).toBeNull()
}, 30_000)

test('json', async () => {
  const account = await factory.account.insert({})
  const suffix = Nanoid.generate()
  const token = `curlmd_${suffix}`
  await factory.api_key.insert({
    account_id: account.id,
    key_hash: await ApiKey.hash(token),
    key_prefix: token.slice(0, 9),
    name: `test-${suffix}`,
  })
  const { output } = await serve(['example.com', '--json'], { CURLMD_API_KEY: token })
  const json = JSON.parse(output)
  const content = json.data ?? json.content ?? json
  expect(typeof content === 'string' ? content : JSON.stringify(content)).toContain(
    'Example Domain',
  )
}, 30_000)

test('invalid url', async () => {
  const { exitCode, output } = await serve(['!!!invalid'])
  expect(exitCode).toBe(1)
  expect(output).toMatchInlineSnapshot(`
    "## code

    INVALID_URL

    ## message

    Invalid URL: !!!invalid

    ## cta.description

    URL must be valid HTTP(S) address:

    ## cta.commands

    | command                          | description             |
    |----------------------------------|-------------------------|
    | curl.md example.com              | domain without protocol |
    | curl.md https://example.com/path | full URL with protocol  |
    "
  `)
})

test('missing url', async () => {
  const { exitCode, output } = await serve([])
  expect(exitCode).toBe(1)
  expect(output).toContain('VALIDATION_ERROR')
})

test('rate limit 429', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        !(url.origin === baseUrl.origin && url.href.startsWith(`${env.CURLMD_BASE_URL}/api/http`))
      )
        return passthrough()
      return HttpResponse.json(
        { code: 'rate_limit_exceeded', message: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'retry-after': '3600',
          },
        },
      )
    }),
  )

  const { exitCode, output } = await serve(['example.com'])
  expect(exitCode).toBe(1)
  expect(output).toContain('RATE_LIMIT_EXCEEDED')
  expect(output).toContain('3600s')
})

test('rate limit 429 without retry-after', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        !(url.origin === baseUrl.origin && url.href.startsWith(`${env.CURLMD_BASE_URL}/api/http`))
      )
        return passthrough()
      return HttpResponse.json(
        { code: 'rate_limit_exceeded', message: 'Rate limit exceeded' },
        { status: 429 },
      )
    }),
  )

  const { exitCode, output } = await serve(['example.com'])
  expect(exitCode).toBe(1)
  expect(output).toContain('RATE_LIMIT_EXCEEDED')
  expect(output).toContain('Rate limit exceeded')
})

test('rate limit 429 login cta when unauthenticated', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        !(url.origin === baseUrl.origin && url.href.startsWith(`${env.CURLMD_BASE_URL}/api/http`))
      )
        return passthrough()
      return HttpResponse.json(
        { code: 'rate_limit_exceeded', message: 'Rate limit exceeded' },
        { status: 429 },
      )
    }),
  )

  const { output } = await serve(['example.com'])
  expect(output).toContain('auth login')
})

test('rate limit 429 credits add cta when authenticated', async () => {
  const account = await factory.account.insert({})
  const session = await factory.session.insert({ account_id: account.id })
  await writeCliSession(session)
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        !(url.origin === baseUrl.origin && url.href.startsWith(`${env.CURLMD_BASE_URL}/api/http`))
      )
        return passthrough()
      return HttpResponse.json(
        { code: 'rate_limit_exceeded', message: 'Rate limit exceeded' },
        { status: 429 },
      )
    }),
  )

  const { output } = await serve(['example.com'])
  expect(output).toContain('credits add')
  expect(output).not.toContain('auth login')
})

test('invalid api key 401', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        !(url.origin === baseUrl.origin && url.href.startsWith(`${env.CURLMD_BASE_URL}/api/http`))
      )
        return passthrough()
      return HttpResponse.json(
        { code: 'invalid_api_key', message: 'Invalid API key' },
        { status: 401 },
      )
    }),
  )

  const { exitCode, output } = await serve(['example.com'])
  expect(exitCode).toBe(1)
  expect(output).toContain('INVALID_API_KEY')
  expect(output).toContain('token create')
})

test('expired session falls back to anon fetch and deletes session', async () => {
  Session.write({ refresh_token: 'expired-refresh-token' })

  server.use(
    http.post(`${env.CURLMD_BASE_URL}/api/auth/headers`, async () => {
      return HttpResponse.json(
        { code: 'unauthorized', message: 'Authentication required' },
        { status: 401 },
      )
    }),
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        !(url.origin === baseUrl.origin && url.href.startsWith(`${env.CURLMD_BASE_URL}/api/http`))
      )
        return passthrough()
      expect(request.headers.get('authorization')).toBeNull()
      expect(request.headers.get('x-organization-id')).toBeNull()
      return new HttpResponse('Anonymous content', { status: 200 })
    }),
  )

  const { output } = await serve(['example.com'])
  expect(output).toContain('Anonymous content')
  expect(Session.read()).toBeNull()
})

test('validation error 400', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        !(url.origin === baseUrl.origin && url.href.startsWith(`${env.CURLMD_BASE_URL}/api/http`))
      )
        return passthrough()
      return HttpResponse.json(
        {
          code: 'validation_error',
          message: 'Validation failed',
          issues: [{ path: 'url', message: 'Invalid url' }],
        },
        { status: 400 },
      )
    }),
  )

  const { exitCode, output } = await serve(['example.com'])
  expect(exitCode).toBe(1)
  expect(output).toContain('VALIDATION_ERROR')
  expect(output).toContain('url')
})

test('fetch_failed 502', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        !(url.origin === baseUrl.origin && url.href.startsWith(`${env.CURLMD_BASE_URL}/api/http`))
      )
        return passthrough()
      return HttpResponse.json(
        {
          code: 'fetch_failed',
          message: 'Connection refused',
        },
        { status: 502 },
      )
    }),
  )

  const { exitCode, output } = await serve(['example.com'])
  expect(exitCode).toBe(1)
  expect(output).toContain('FETCH_FAILED')
  expect(output).toContain('Connection refused')
})

test('unexpected 500', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        !(url.origin === baseUrl.origin && url.href.startsWith(`${env.CURLMD_BASE_URL}/api/http`))
      )
        return passthrough()
      return new HttpResponse('Internal Server Error', { status: 500 })
    }),
  )

  const { exitCode, output } = await serve(['example.com'])
  expect(exitCode).toBe(1)
  expect(output).toContain('FETCH_FAILED')
})

test('objective cta shown for long responses', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        !(url.origin === baseUrl.origin && url.href.startsWith(`${env.CURLMD_BASE_URL}/api/http`))
      )
        return passthrough()
      return new HttpResponse('x'.repeat(15_000), { status: 200 })
    }),
  )

  const { output } = await serve(['example.com', '--full-output'])
  expect(output).toContain('Narrow results with objective')
})

test('objective cta hidden for short responses', async () => {
  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        !(url.origin === baseUrl.origin && url.href.startsWith(`${env.CURLMD_BASE_URL}/api/http`))
      )
        return passthrough()
      return new HttpResponse('short content', { status: 200 })
    }),
  )

  const { output } = await serve(['example.com', '--full-output'])
  expect(output).not.toContain('narrow results with an objective')
})

describe('update check middleware', () => {
  test('no cache - spawns background check', async () => {
    const spy = vi.spyOn(UpdateCache, 'spawnCheck').mockImplementation(() => {})
    onTestFinished(() => spy.mockRestore())

    await serve(['auth', 'status'])
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

    await serve(['auth', 'status'])
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

    await serve(['auth', 'status'])
    expect(spy).not.toHaveBeenCalled()
  })

  test('newer version available - shows update command', async () => {
    UpdateCache.write({
      checked_at: Date.now(),
      latest: '99.0.0',
      released_at: null,
    })
    const spawnSpy = vi.spyOn(UpdateCache, 'spawnCheck').mockImplementation(() => {})
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
    const spawnSpy = vi.spyOn(UpdateCache, 'spawnCheck').mockImplementation(() => {})
    const compareSpy = vi.spyOn(utils, 'compareVersions').mockReturnValue(1)
    onTestFinished(() => {
      spawnSpy.mockRestore()
      compareSpy.mockRestore()
    })

    const { output } = await serve(['!!!invalid'])
    expect(output).toContain('released 3h')
  })

  test('version is current - no update command', async () => {
    UpdateCache.write({
      checked_at: Date.now(),
      latest: '0.0.1',
      released_at: null,
    })
    const spawnSpy = vi.spyOn(UpdateCache, 'spawnCheck').mockImplementation(() => {})
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
    const { output } = await serve(['auth', 'status'])
    expect(output).toContain('Not authenticated')
  })

  test('logout - not logged in', async () => {
    const { output } = await serve(['auth', 'logout'])
    expect(output).toContain('Already logged out')
  })

  test('logout - deletes session', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const { output } = await serve(['auth', 'logout'])
    expect(output).toContain('Logged out')
    expect(Session.read()).toBeNull()
  })

  test('logout - still succeeds when revoke fails', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    server.use(
      http.post(`${env.CURLMD_BASE_URL}/api/auth/logout`, async () => {
        return new HttpResponse(null, { status: 500 })
      }),
    )

    const { output } = await serve(['auth', 'logout'])
    expect(output).toContain('Logged out')
    expect(Session.read()).toBeNull()
  })

  test('logout - succeeds when revocation fails', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    server.use(
      http.post(`${env.CURLMD_BASE_URL}/api/auth/logout`, async ({ request }) => {
        expect(request.headers.get('authorization')).toMatch(/^Bearer curlmd_rt_/)
        return HttpResponse.json(
          { code: 'upstream_error', message: 'Upstream request failed' },
          { status: 500 },
        )
      }),
    )

    const { output } = await serve(['auth', 'logout'])
    expect(output).toContain('Logged out')
    expect(Session.read()).toBeNull()
  })

  test('check - with --token', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })
    const suffix = Nanoid.generate()
    const token = ApiKey.generate()
    await factory.api_key.insert({
      organization_id: org.id,
      account_id: account.id,
      key_hash: await ApiKey.hash(token),
      key_prefix: token.slice(0, 9),
      name: `check-test-${suffix}`,
    })

    const origArgv = process.argv
    process.argv = [...origArgv, '--token', token]
    onTestFinished(() => {
      process.argv = origArgv
    })

    const { output } = await serve(['auth', 'status', '--token', token])
    expect(output).toContain('Logged in as')
    expect(output).toContain(account.login)
    expect(output).toContain('Auth: token')
    expect(output).toContain(token.slice(0, 12))
  })

  test('check - with --token wins over saved session account', async () => {
    const sessionAccount = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: sessionAccount.id })
    await writeCliSession(session)

    const tokenAccount = await factory.account.insert({})
    const suffix = Nanoid.generate()
    const token = ApiKey.generate()
    await factory.api_key.insert({
      account_id: tokenAccount.id,
      key_hash: await ApiKey.hash(token),
      key_prefix: token.slice(0, 9),
      name: `check-wins-test-${suffix}`,
    })

    const origArgv = process.argv
    process.argv = [...origArgv, '--token', token]
    onTestFinished(() => {
      process.argv = origArgv
    })

    const { output } = await serve(['auth', 'status', '--token', token])
    expect(output).toContain(tokenAccount.login)
    expect(output).not.toContain(sessionAccount.login)
    expect(output).toContain('Auth: token')
  })

  test('check - with --token ignores stored session organization', async () => {
    const account = await factory.account.insert({})
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session, org.id)

    const suffix = Nanoid.generate()
    const token = ApiKey.generate()
    await factory.api_key.insert({
      organization_id: org.id,
      account_id: account.id,
      key_hash: await ApiKey.hash(token),
      key_prefix: token.slice(0, 9),
      name: `check-org-test-${suffix}`,
    })

    const origArgv = process.argv
    process.argv = [...origArgv, '--token', token]
    onTestFinished(() => {
      process.argv = origArgv
    })

    const { output } = await serve(['auth', 'status', '--token', token])
    expect(output).toContain('Auth: token')
    expect(output).toContain('Organization: none')
  })

  test('check - with invalid --token', async () => {
    const invalidToken = 'curlmd_invalidtoken'
    const origArgv = process.argv
    process.argv = [...origArgv, '--token', invalidToken]
    onTestFinished(() => {
      process.argv = origArgv
    })

    const { output } = await serve(['auth', 'status', '--token', invalidToken])
    expect(output).toContain('Not authenticated')
  })

  test('check - invalid --token does not delete shared session', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const invalidToken = 'curlmd_invalidtoken'
    const origArgv = process.argv
    process.argv = [...origArgv, '--token', invalidToken]
    onTestFinished(() => {
      process.argv = origArgv
    })

    const { exitCode, output } = await serve(['auth', 'status', '--token', invalidToken])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toMatchObject({
      refresh_token: expect.stringMatching(/^curlmd_rt_/),
      refresh_token_expires_at: expect.any(String),
    })
  })

  test('check - expired session', async () => {
    Session.write({ refresh_token: 'expired-refresh-token' })

    const { output } = await serve(['auth', 'status'])
    expect(output).toContain('Not authenticated')
    expect(Session.read()).toBeNull()
  })

  test('login - already authenticated', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const { output } = await serve(['auth', 'login'])
    expect(output).toContain('Already logged in')
  })

  test('login - expired device code', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    onTestFinished(() => consoleSpy.mockRestore())

    server.use(
      http.post(`${env.CURLMD_BASE_URL}/api/auth/device`, async () => {
        return HttpResponse.json({
          code: 'test-code',
          interval: 0,
          user_code: 'TESTCODE',
          verification_uri: 'https://curl.local/auth/device',
        })
      }),
      http.post(`${env.CURLMD_BASE_URL}/api/auth/device/token`, async () => {
        return HttpResponse.json(
          { code: 'expired_token', message: 'Token has expired' },
          { status: 400 },
        )
      }),
    )

    const { exitCode, output } = await serve(['auth', 'login'])
    expect(exitCode).toBe(1)
    expect(output).toContain('EXPIRED_TOKEN')
  })

  test('login - malformed token request', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    onTestFinished(() => consoleSpy.mockRestore())

    server.use(
      http.post(`${env.CURLMD_BASE_URL}/api/auth/device`, async () => {
        return HttpResponse.json({
          code: 'test-code',
          interval: 0,
          user_code: 'TESTCODE',
          verification_uri: 'https://curl.local/auth/device',
        })
      }),
      http.post(`${env.CURLMD_BASE_URL}/api/auth/device/token`, async () => {
        return HttpResponse.json(
          {
            code: 'validation_error',
            message: 'Validation failed',
            issues: [{ path: 'code', message: 'Required' }],
          },
          { status: 400 },
        )
      }),
    )

    const { exitCode, output } = await serve(['auth', 'login'])
    expect(exitCode).toBe(1)
    expect(output).toContain('VALIDATION_ERROR')
    expect(output).toContain('code')
  })

  test('login - rate limit on device request', async () => {
    server.use(
      http.post(`${env.CURLMD_BASE_URL}/api/auth/device`, async () => {
        return HttpResponse.json(
          { code: 'rate_limit_exceeded', message: 'Rate limit exceeded' },
          {
            status: 429,
            headers: {
              'retry-after': '30',
            },
          },
        )
      }),
    )

    const { exitCode, output } = await serve(['auth', 'login'])
    expect(exitCode).toBe(1)
    expect(output).toContain('RATE_LIMIT_EXCEEDED')
    expect(output).toContain('30s')
  })

  test('login - ignores api key for already-authenticated check', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)
    const token = 'curlmd_invalidtoken'

    const origArgv = process.argv
    process.argv = [...origArgv, '--token', token]
    onTestFinished(() => {
      process.argv = origArgv
    })

    const { output } = await serve(['auth', 'login'])
    expect(output).toContain('Already logged in')
    expect(output).toContain(account.login)
  })

  test('login - rate limit on token polling retries', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    onTestFinished(() => consoleSpy.mockRestore())

    const account = await factory.account.insert({})
    const cliSession = await SessionToken.createCliSession(db, account.id)

    let tokenPollCount = 0
    server.use(
      http.post(`${env.CURLMD_BASE_URL}/api/auth/device`, async () => {
        return HttpResponse.json({
          code: 'test-code',
          interval: 0,
          user_code: 'TESTCODE',
          verification_uri: 'https://curl.local/auth/device',
        })
      }),
      http.post(`${env.CURLMD_BASE_URL}/api/auth/device/token`, async () => {
        tokenPollCount++
        if (tokenPollCount === 1)
          return HttpResponse.json(
            { code: 'rate_limit_exceeded', message: 'Rate limit exceeded' },
            {
              status: 429,
              headers: {
                'retry-after': '0',
              },
            },
          )
        return HttpResponse.json(cliSession)
      }),
      http.get(`${env.CURLMD_BASE_URL}/api/auth/me`, async () => {
        return HttpResponse.json({
          account: {
            login: account.login,
          },
        })
      }),
    )

    const loginPromise = serve(['auth', 'login'])

    const { output } = await loginPromise
    expect(output).toContain('Logged in as')
  })

  test('login - full device flow', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    onTestFinished(() => consoleSpy.mockRestore())

    const account = await factory.account.insert({})
    const cliSession = await SessionToken.createCliSession(db, account.id)

    server.use(
      http.post(`${env.CURLMD_BASE_URL}/api/auth/device`, async () => {
        return HttpResponse.json({
          code: 'test-code',
          interval: 0,
          user_code: 'TESTCODE',
          verification_uri: 'https://curl.local/auth/device',
        })
      }),
      http.post(`${env.CURLMD_BASE_URL}/api/auth/device/token`, async () => {
        return HttpResponse.json(cliSession)
      }),
      http.get(`${env.CURLMD_BASE_URL}/api/auth/me`, async ({ request }) => {
        expect(request.headers.get('authorization')).toMatch(/^Bearer curlmd_at_/)
        return HttpResponse.json({
          account: {
            login: account.login,
          },
        })
      }),
    )

    const loginPromise = serve(['auth', 'login'])

    const { output } = await loginPromise
    expect(output).toContain('Logged in as')
    expect(Session.read()).toMatchObject({
      refresh_token: expect.stringMatching(/^curlmd_rt_/),
      refresh_token_expires_at: expect.any(String),
    })

    const { output: checkOutput } = await serve(['auth', 'status'])
    expect(checkOutput).toContain('Logged in as')
  })

  test('internal waitForLogin writes session before account lookup and clears org', async () => {
    const account = await factory.account.insert({})
    const cliSession = await SessionToken.createCliSession(db, account.id)
    Session.write({
      organization_id: 'stale-org',
      refresh_token: 'stale-refresh-token',
      refresh_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    })

    server.use(
      http.post(`${env.CURLMD_BASE_URL}/api/auth/device/token`, async () => {
        return HttpResponse.json(cliSession)
      }),
      http.get(`${env.CURLMD_BASE_URL}/api/auth/me`, async () => {
        expect(Session.read()).toMatchObject({
          refresh_token: cliSession.refresh_token,
          refresh_token_expires_at: cliSession.refresh_token_expires_at,
        })
        expect(Session.read()?.organization_id).toBeUndefined()
        return HttpResponse.json(
          { code: 'upstream_error', message: 'Upstream request failed' },
          { status: 500 },
        )
      }),
    )

    const result = await Auth.waitForLogin(env.CURLMD_BASE_URL, {
      code: 'test-code',
      interval: 0,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.login).toBeNull()
      expect(result.data.expires_at).toEqual(expect.any(String))
    }
    expect(Session.read()).toMatchObject({
      refresh_token: cliSession.refresh_token,
      refresh_token_expires_at: cliSession.refresh_token_expires_at,
    })
    expect(Session.read()?.organization_id).toBeUndefined()
  })

  test('internal resolver reads organization fresh and drops cached auth when session disappears', async () => {
    const account = await factory.account.insert({})
    const orgA = await factory.organization.insert({})
    const orgB = await factory.organization.insert({})
    await factory.organization_member.insert({
      account_id: account.id,
      organization_id: orgA.id,
    })
    await factory.organization_member.insert({
      account_id: account.id,
      organization_id: orgB.id,
    })
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session, orgA.id)

    let authHeadersCalls = 0
    server.use(
      http.post(`${env.CURLMD_BASE_URL}/api/auth/headers`, async () => {
        authHeadersCalls++
        return passthrough()
      }),
    )

    const resolveAuthHeaders = Auth.createResolver(env.CURLMD_BASE_URL)

    const first = await resolveAuthHeaders()
    expect(first).toEqual(expect.objectContaining({ organization_id: orgA.id }))
    expect(authHeadersCalls).toBe(1)

    Session.write({ organization_id: orgB.id })
    const second = await resolveAuthHeaders()
    expect(second).toEqual(expect.objectContaining({ organization_id: orgB.id }))
    expect(second?.authorization).toBe(first?.authorization)
    expect(authHeadersCalls).toBe(1)

    Session.delete()
    const third = await resolveAuthHeaders()
    expect(third).toBeNull()
  })
})

describe('request', () => {
  test('help', async () => {
    const { output } = await serve(['request', '--help'])
    expect(output).toContain('curl.md request — Manage requests (list, view)')
    expect(output).toContain('Usage: curl.md request <command>')
    expect(output).toContain('list')
    expect(output).toContain('view')
  })

  test('list help', async () => {
    const { output } = await serve(['request', 'list', '--help'])
    expect(output).toContain('curl.md request list — List requests')
    expect(output).toContain('Usage: curl.md request list [options]')
    expect(output).toContain('Aliases: ls')
    expect(output).toContain('--search, -s <string>')
    expect(output).toContain('--limit, -l <number>')
    expect(output).toContain('--page, -p <number>')
  })

  test('view help', async () => {
    const { output } = await serve(['request', 'view', '--help'])
    expect(output).toContain('curl.md request view — View request')
    expect(output).toContain('Usage: curl.md request view [request] [options]')
    expect(output).toContain('Arguments:')
    expect(output).toContain('request  Request ID to view')
    expect(output).toContain('--verbose  Show all request fields')
    expect(output).toContain('--web, -w  Open original URL in browser')
  })

  test('list - happy path', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      account_id: account.id,
      organization_id: org.id,
    })
    await writeCliSession(session, org.id)

    server.use(
      http.get(`${env.CURLMD_BASE_URL}/api/requests`, async ({ request }) => {
        const url = new URL(request.url)
        expect(request.headers.get('authorization')).toMatch(/^Bearer curlmd_at_/)
        expect(request.headers.get('x-organization-id')).toBe(org.id)
        expect(url.searchParams.get('search')).toBe('example.com')
        expect(url.searchParams.get('limit')).toBe('2')
        expect(url.searchParams.get('page')).toBe('3')
        return HttpResponse.json({
          requests: [
            {
              created_at: '2026-01-02T03:04:05.000Z',
              id: 'req_123',
              keywords: null,
              objective: 'tree error formatting',
              tokens_saved: 111,
              url: 'https://example.com/docs/zod',
            },
            {
              created_at: '2026-01-02T04:05:06.000Z',
              id: 'req_456',
              keywords: 'ReadableStream,getReader',
              objective: null,
              tokens_saved: 42,
              url: 'https://example.com/docs/fetch',
            },
          ],
          total: 2,
        })
      }),
    )

    const { output } = await serve([
      'request',
      'list',
      '--search',
      'example.com',
      '--limit',
      '2',
      '--page',
      '3',
    ])
    expect(output).toContain('req_123')
    expect(output).toContain('req_456')
    expect(output).toContain('example.com/docs/zod')
    expect(output).toContain('example.com/docs/fetch')
    expect(output).toContain('111')
    expect(output).toContain('42')
    expect(output).toContain('$0.0003')
    expect(output).toContain('$0.0001')
  })

  test('list - clamps negative savings to zero', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      account_id: account.id,
      organization_id: org.id,
    })
    await writeCliSession(session, org.id)

    server.use(
      http.get(`${env.CURLMD_BASE_URL}/api/requests`, async () => {
        return HttpResponse.json({
          requests: [
            {
              cached: false,
              created_at: '2026-01-02T04:05:06.000Z',
              id: 'req_456',
              keywords: null,
              objective: null,
              tokens_saved: -39,
              url: 'https://example.com/docs/fetch',
            },
          ],
          total: 1,
        })
      }),
    )

    const { output } = await serve(['request', 'list'])
    expect(output).toContain('0')
    expect(output).toContain('$0.0')
    expect(output).not.toContain('$NaN')
    expect(output).not.toContain('-39')
    expect(output).not.toContain('$-0.0001')
  })

  test('list - empty state', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      account_id: account.id,
      organization_id: org.id,
    })
    await writeCliSession(session, org.id)

    server.use(
      http.get(`${env.CURLMD_BASE_URL}/api/requests`, async () => {
        return HttpResponse.json({ requests: [], total: 0 })
      }),
    )

    const { output } = await serve(['request', 'list'])
    expect(output).toContain('No requests found.')
  })

  test('view - combines primary fields, pins id and created first, and sorts the rest', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      account_id: account.id,
      organization_id: org.id,
    })
    await writeCliSession(session, org.id)

    server.use(
      http.get(`${env.CURLMD_BASE_URL}/api/requests/req_123`, async ({ request }) => {
        expect(request.headers.get('authorization')).toMatch(/^Bearer curlmd_at_/)
        expect(request.headers.get('x-organization-id')).toBe(org.id)
        return HttpResponse.json({
          request: {
            cached: false,
            created_at: '2026-01-02T03:04:05.000Z',
            extracted_tokens: 120,
            filtered_tokens: 48,
            hostname: 'example.com',
            id: 'req_123',
            keywords: 'treeifyError,zod',
            markdown_tokens: 240,
            mode: 'smart',
            objective: 'tree error formatting',
            path: '/docs/zod',
            source_tokens: 360,
            source_tokens_method: 'html',
            tokens_saved: 120,
            url: 'https://example.com/docs/zod',
          },
        })
      }),
    )

    const { output } = await serve(['request', 'view', 'req_123'])
    expect(output.indexOf('id:\treq_123')).toBeLessThan(output.indexOf('created:\t'))
    expect(output.indexOf('created:\t')).toBeLessThan(output.indexOf('cached:\tno'))
    expect(output.indexOf('cached:\tno')).toBeLessThan(
      output.indexOf('keywords:\ttreeifyError,zod'),
    )
    expect(output.indexOf('keywords:\ttreeifyError,zod')).toBeLessThan(
      output.indexOf('mode:\tsmart'),
    )
    expect(output.indexOf('mode:\tsmart')).toBeLessThan(
      output.indexOf('objective:\ttree error formatting'),
    )
    expect(output.indexOf('objective:\ttree error formatting')).toBeLessThan(
      output.indexOf('url:\thttps://example.com/docs/zod'),
    )
    expect(output).toContain('url:\thttps://example.com/docs/zod\n\ncost saved:\t$0.0003')
    expect(output.indexOf('cost saved:\t$0.0003')).toBeLessThan(
      output.indexOf('tokens saved:\t120'),
    )
    expect(output).toContain('id:\treq_123')
    expect(output).toContain('url:\thttps://example.com/docs/zod')
    expect(output).toContain('objective:\ttree error formatting')
    expect(output).toContain('keywords:\ttreeifyError,zod')
    expect(output).toContain('tokens saved:\t120')
    expect(output).toContain('cost saved:\t$0.0003')
    expect(output).not.toContain('hostname:\texample.com')
    expect(output).not.toContain('source tokens:\t360')
  })

  test('view - verbose combines secondary fields and sorts them alphabetically', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      account_id: account.id,
      organization_id: org.id,
    })
    await writeCliSession(session, org.id)

    server.use(
      http.get(`${env.CURLMD_BASE_URL}/api/requests/req_123`, async () => {
        return HttpResponse.json({
          request: {
            cached: false,
            created_at: '2026-01-02T03:04:05.000Z',
            extracted_tokens: 120,
            filtered_tokens: 48,
            hostname: 'example.com',
            id: 'req_123',
            keywords: 'treeifyError,zod',
            markdown_tokens: 240,
            mode: 'smart',
            objective: 'tree error formatting',
            path: '/docs/zod',
            source_tokens: 360,
            source_tokens_method: 'html',
            tokens_saved: 120,
            url: 'https://example.com/docs/zod',
          },
        })
      }),
    )

    const { output } = await serve(['request', 'view', 'req_123', '--verbose'])
    expect(output).toContain('extracted tokens:\t120')
    expect(output).toContain('filtered tokens:\t48')
    expect(output).toContain('markdown tokens:\t240')
    expect(output).toContain('source method:\thtml')
    expect(output).toContain('source tokens:\t360')
    expect(output).not.toContain('hostname:\texample.com')
    expect(output).not.toContain('path:\t/docs/zod')
    expect(output).toContain('url:\thttps://example.com/docs/zod\n\ncost saved:\t$0.0003')
    expect(output.indexOf('cost saved:\t$0.0003')).toBeLessThan(
      output.indexOf('extracted tokens:\t120'),
    )
    expect(output.indexOf('extracted tokens:\t120')).toBeLessThan(
      output.indexOf('filtered tokens:\t48'),
    )
    expect(output.indexOf('filtered tokens:\t48')).toBeLessThan(
      output.indexOf('markdown tokens:\t240'),
    )
    expect(output.indexOf('markdown tokens:\t240')).toBeLessThan(
      output.indexOf('source method:\thtml'),
    )
    expect(output.indexOf('source method:\thtml')).toBeLessThan(
      output.indexOf('source tokens:\t360'),
    )
    expect(output.indexOf('source tokens:\t360')).toBeLessThan(output.indexOf('tokens saved:\t120'))
    expect(output).not.toContain('tokens saved:\t120\n\nextracted tokens:\t120')
  })

  test('view - clamps negative savings to zero', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      account_id: account.id,
      organization_id: org.id,
    })
    await writeCliSession(session, org.id)

    server.use(
      http.get(`${env.CURLMD_BASE_URL}/api/requests/req_123`, async () => {
        return HttpResponse.json({
          request: {
            cached: false,
            created_at: '2026-01-02T03:04:05.000Z',
            extracted_tokens: null,
            filtered_tokens: null,
            hostname: 'example.com',
            id: 'req_123',
            keywords: null,
            markdown_tokens: 308,
            mode: null,
            objective: null,
            path: '/docs/zod',
            source_tokens: 269,
            source_tokens_method: 'html',
            tokens_saved: -39,
            url: 'https://example.com/docs/zod',
          },
        })
      }),
    )

    const { output } = await serve(['request', 'view', 'req_123'])
    expect(output).toContain('tokens saved:\t0')
    expect(output).toContain('cost saved:\t$0.0')
    expect(output).not.toContain('tokens saved:\t-39')
    expect(output).not.toContain('cost saved:\t$-0.0001')
  })

  test('view - not found', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      account_id: account.id,
      organization_id: org.id,
    })
    await writeCliSession(session, org.id)

    server.use(
      http.get(`${env.CURLMD_BASE_URL}/api/requests/req_missing`, async () => {
        return HttpResponse.json(
          { code: 'not_found', message: 'Request not found' },
          { status: 404 },
        )
      }),
    )

    const { exitCode, output } = await serve(['request', 'view', 'req_missing'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_FOUND')
    expect(output).toContain('Request not found')
  })
})

describe('credits', () => {
  test('check - requires auth', async () => {
    const { exitCode, output } = await serve(['credits', 'status'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
  })

  test('check - expired session deletes session', async () => {
    Session.write({ refresh_token: 'expired-refresh-token' })
    const { exitCode, output } = await serve(['credits', 'status'])
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
    await writeCliSession(session)

    const { output } = await serve(['credits', 'status'])
    expect(output).toContain('$12.500')
  })

  test('check - zero balance', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const { output } = await serve(['credits', 'status'])
    expect(output).toContain('No credits')
  })

  test('check - forbidden for non-admin org member', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'member',
    })
    await writeCliSession(session, org.id)

    const { exitCode, output } = await serve(['credits', 'status'])
    expect(exitCode).toBe(1)
    expect(output).toContain('ORGANIZATION_ACCESS_DENIED')
  })

  test('add - forbidden for non-admin org member', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
      role: 'member',
    })
    await writeCliSession(session, org.id)

    const { exitCode, output } = await serve(['credits', 'add', '5'])
    expect(exitCode).toBe(1)
    expect(output).toContain('ORGANIZATION_ACCESS_DENIED')
  })

  test('add - requires auth', async () => {
    const { exitCode, output } = await serve(['credits', 'add', '5'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
  })

  test('add - browser flow (no saved card)', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const openUrlSpy = vi.spyOn(utils, 'openUrl').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    let creditsCallCount = 0
    server.use(
      http.get('*', async ({ request }) => {
        const url = new URL(request.url)
        if (!(url.origin === baseUrl.origin && url.pathname === '/api/credits'))
          return passthrough()
        creditsCallCount++
        return HttpResponse.json({
          balance_mills: creditsCallCount <= 1 ? 0 : 10_000,
          payment_method: null,
        })
      }),
      http.post('*', async ({ request }) => {
        const url = new URL(request.url)
        if (!(url.origin === baseUrl.origin && url.pathname === '/api/credits/add'))
          return passthrough()
        return HttpResponse.json({
          url: 'https://curl.local/credits/add/pay_test',
          payment_id: 'pay_test',
        })
      }),
    )

    onTestFinished(() => {
      openUrlSpy.mockRestore()
      consoleLogSpy.mockRestore()
    })

    const { output } = await serve(['credits', 'add', '10'])
    expect(openUrlSpy).toHaveBeenCalledWith('https://curl.local/credits/add/pay_test')
    expect(output).toContain('Credits added')
    expect(output).toContain('$10.000')
  })

  test('add - charges saved card', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const selectSpy = vi.spyOn(UI, 'select').mockResolvedValue(0)
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    let creditsCallCount = 0
    server.use(
      http.get('*', async ({ request }) => {
        const url = new URL(request.url)
        if (!(url.origin === baseUrl.origin && url.pathname === '/api/credits'))
          return passthrough()
        creditsCallCount++
        return HttpResponse.json({
          balance_mills: creditsCallCount <= 1 ? 5_000 : 15_000,
          payment_method: { brand: 'visa', last4: '4242' },
        })
      }),
      http.post('*', async ({ request }) => {
        const url = new URL(request.url)
        if (!(url.origin === baseUrl.origin && url.pathname === '/api/credits/charge'))
          return passthrough()
        return HttpResponse.json({ payment_id: 'pi_test', status: 'succeeded' })
      }),
    )

    onTestFinished(() => {
      selectSpy.mockRestore()
      consoleLogSpy.mockRestore()
    })

    const { output } = await serve(['credits', 'add', '10'])
    expect(selectSpy).toHaveBeenCalled()
    expect(output).toContain('Credits added')
    expect(output).toContain('$15.000')
  })

  test('add - surfaces declined saved card message', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const selectSpy = vi.spyOn(UI, 'select').mockResolvedValue(0)

    server.use(
      http.get('*', async ({ request }) => {
        const url = new URL(request.url)
        if (!(url.origin === baseUrl.origin && url.pathname === '/api/credits'))
          return passthrough()
        return HttpResponse.json({
          balance_mills: 5_000,
          payment_method: { brand: 'visa', last4: '0019' },
        })
      }),
      http.post('*', async ({ request }) => {
        const url = new URL(request.url)
        if (!(url.origin === baseUrl.origin && url.pathname === '/api/credits/charge'))
          return passthrough()
        return HttpResponse.json(
          {
            code: 'payment_failed',
            message: 'Your card was declined as fraudulent. Try a different payment method.',
          },
          { status: 400 },
        )
      }),
    )

    onTestFinished(() => {
      selectSpy.mockRestore()
    })

    const { exitCode, output } = await serve(['credits', 'add', '10'])
    expect(exitCode).toBe(1)
    expect(output).toContain('PAYMENT_FAILED')
    expect(output).toContain(
      'Your card was declined as fraudulent. Try a different payment method.',
    )
  })

  test('add - falls back to browser on requires_action', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const selectSpy = vi.spyOn(UI, 'select').mockResolvedValue(0)
    const openUrlSpy = vi.spyOn(utils, 'openUrl').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    let creditsCallCount = 0
    server.use(
      http.get('*', async ({ request }) => {
        const url = new URL(request.url)
        if (!(url.origin === baseUrl.origin && url.pathname === '/api/credits'))
          return passthrough()
        creditsCallCount++
        return HttpResponse.json({
          balance_mills: creditsCallCount <= 1 ? 5_000 : 15_000,
          payment_method: { brand: 'visa', last4: '4242' },
        })
      }),
      http.post('*', async ({ request }) => {
        const url = new URL(request.url)
        if (!(url.origin === baseUrl.origin && url.pathname === '/api/credits/charge'))
          return passthrough()
        return HttpResponse.json({
          payment_id: 'pay_3ds',
          status: 'requires_action',
          url: 'https://curl.local/credits/add/pay_3ds',
        })
      }),
    )

    onTestFinished(() => {
      selectSpy.mockRestore()
      openUrlSpy.mockRestore()
      consoleLogSpy.mockRestore()
    })

    const { output } = await serve(['credits', 'add', '10'])
    expect(openUrlSpy).toHaveBeenCalledWith('https://curl.local/credits/add/pay_3ds')
    expect(output).toContain('Credits added')
    expect(output).toContain('$15.000')
  })

  test('add - user selects new payment method', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const selectSpy = vi.spyOn(UI, 'select').mockResolvedValue(2)
    const openUrlSpy = vi.spyOn(utils, 'openUrl').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    let creditsCallCount = 0
    server.use(
      http.get('*', async ({ request }) => {
        const url = new URL(request.url)
        if (!(url.origin === baseUrl.origin && url.pathname === '/api/credits'))
          return passthrough()
        creditsCallCount++
        return HttpResponse.json({
          balance_mills: creditsCallCount <= 1 ? 5_000 : 15_000,
          payment_method: { brand: 'visa', last4: '4242' },
        })
      }),
      http.post('*', async ({ request }) => {
        const url = new URL(request.url)
        if (!(url.origin === baseUrl.origin && url.pathname === '/api/credits/add'))
          return passthrough()
        return HttpResponse.json({
          url: 'https://curl.local/credits/add/pay_new',
          payment_id: 'pay_new',
        })
      }),
    )

    onTestFinished(() => {
      selectSpy.mockRestore()
      openUrlSpy.mockRestore()
      consoleLogSpy.mockRestore()
    })

    const { output } = await serve(['credits', 'add', '10'])
    expect(openUrlSpy).toHaveBeenCalledWith('https://curl.local/credits/add/pay_new')
    expect(output).toContain('Credits added')
    expect(output).toContain('$15.000')
  })

  test('add - expired session deletes session', async () => {
    Session.write({ refresh_token: 'expired-refresh-token' })
    const { exitCode, output } = await serve(['credits', 'add', '5'])
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

  test('list - empty when no orgs', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const { output } = await serve(['org', 'list'])
    expect(output).toContain('No organizations.')
  })

  test('view - no active org, no orgs', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const { output } = await serve(['org', 'view'])
    expect(output).toContain('No active organization')
    expect(output).toContain('org create')
  })

  test('view - no active org, has orgs', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })
    await writeCliSession(session)

    const { output } = await serve(['org', 'view'])
    expect(output).toContain('No active organization')
    expect(output).toContain('org switch')
  })

  test('create, list, switch, show - full flow', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const login = `test-org${Nanoid.generate()}`
    const { output: createOutput } = await serve(['org', 'create', login, '--name', 'Test Org'])
    expect(createOutput).toContain('Created organization')
    expect(createOutput).toContain(login)

    const { output: listOutput } = await serve(['org', 'list'])
    expect(listOutput).toContain(login)

    const { output: switchOutput } = await serve(['org', 'switch', login])
    expect(switchOutput).toContain(`Switched to ${login}`)

    const { output: viewOutput } = await serve(['org', 'view'])
    expect(viewOutput).toContain(login)

    const { output: switchBackOutput } = await serve(['org', 'switch', 'account'])
    expect(switchBackOutput).toContain('Switched to')
  })

  test('list - non-TTY outputs tab-separated values without headers', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const login = `nontty-org${Nanoid.generate()}`
    await serve(['org', 'create', login, '--name', 'Test'])

    const { output } = await serve(['org', 'list'])
    const lines = output.trim().split('\n')
    // No header row — first line is data
    expect(lines[0]).toContain('\t')
    // Should NOT contain table headers
    expect(output).not.toContain('LOGIN')
    expect(output).not.toContain('CREATED')
  })

  test('create - invalid login', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const { exitCode, output } = await serve(['org', 'create', '!'])
    expect(exitCode).toBe(1)
    expect(output).toContain('VALIDATION_ERROR')
    expect(output).toContain('login')
  })

  test('create - duplicate login', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const login = `dup-org${Nanoid.generate()}`
    await serve(['org', 'create', login])
    const { exitCode, output } = await serve(['org', 'create', login])
    expect(exitCode).toBe(1)
    expect(output).toContain('LOGIN_TAKEN')
  })

  test('create - expired session deletes session', async () => {
    Session.write({ refresh_token: 'expired-refresh-token' })

    const { exitCode, output } = await serve(['org', 'create', 'my-org'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('list - expired session deletes session', async () => {
    Session.write({ refresh_token: 'expired-refresh-token' })

    const { exitCode, output } = await serve(['org', 'list'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('show - expired session deletes session', async () => {
    Session.write({ refresh_token: 'expired-refresh-token', organization_id: 'stale' })

    const { exitCode, output } = await serve(['org', 'view'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('switch - expired session deletes session', async () => {
    Session.write({ refresh_token: 'expired-refresh-token' })

    const { exitCode, output } = await serve(['org', 'switch', 'some-org'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('switch - nonexistent org', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const { exitCode, output } = await serve(['org', 'switch', 'nonexistent-org'])
    expect(exitCode).toBe(1)
    expect(output).toContain('ORG_NOT_FOUND')
  })

  test('switch - selector marks active org with checkmark', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const orgA = await factory.organization.insert({ login: `wevm${Nanoid.generate()}` })
    const orgB = await factory.organization.insert({ login: `tempo${Nanoid.generate()}` })
    await factory.organization_member.insert({ account_id: account.id, organization_id: orgA.id })
    await factory.organization_member.insert({ account_id: account.id, organization_id: orgB.id })
    await writeCliSession(session, orgB.id)

    const selectSpy = vi.spyOn(UI, 'select').mockResolvedValue(0)
    onTestFinished(() => {
      selectSpy.mockRestore()
    })

    await serve(['org', 'switch'])

    const maxLabel = Math.max(orgA.login.length, orgB.login.length, account.login.length)

    expect(selectSpy).toHaveBeenCalledWith(
      'Switch organization',
      [
        orgA.login,
        `${orgB.login.padEnd(maxLabel)}  ${pc.green('✓')}`,
        `${account.login.padEnd(maxLabel)}  ${pc.dim('account')}`,
      ],
      { doneLabels: [orgA.login, orgB.login, account.login] },
    )
  })

  test('list - stale org resets to account', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await writeCliSession(session, org.id)

    const { output } = await serve(['org', 'list'])
    expect(output).toContain('No organizations.')
    expect(Session.read()?.organization_id).toBeUndefined()
  })

  test('view - stale org resets to account', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await writeCliSession(session, org.id)

    const { output } = await serve(['org', 'view'])
    expect(output).toContain('no longer accessible')
    expect(Session.read()?.organization_id).toBeUndefined()
  })

  test('fetch - stale org cleared on 403', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await writeCliSession(session, org.id)

    const { exitCode, output } = await serve(['example.com'])
    expect(exitCode).toBe(1)
    expect(output).toContain('ORGANIZATION_ACCESS_DENIED')
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
      await writeCliSession(inviteeSession)

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
      await writeCliSession(inviteeSession)

      const { output } = await serve([
        'org',
        'invite',
        'accept',
        `https://curl.md/invite/${invite.token}`,
      ])
      expect(output).toContain('Joined')
    })

    test('expired session deletes session', async () => {
      Session.write({ refresh_token: 'expired-refresh-token' })

      const { exitCode, output } = await serve(['org', 'invite', 'accept', 'some-token'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_AUTHENTICATED')
      expect(Session.read()).toBeNull()
    })

    test('not found', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      await writeCliSession(session)

      const { exitCode, output } = await serve(['org', 'invite', 'accept', 'fake-token'])
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
      await writeCliSession(inviteeSession)

      await serve(['org', 'invite', 'accept', invite.token])

      const { exitCode, output } = await serve(['org', 'invite', 'accept', invite.token])
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
      Session.write({ refresh_token: 'expired-refresh-token', organization_id: 'stale' })

      const { exitCode, output } = await serve(['org', 'invite', 'create'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_AUTHENTICATED')
      expect(Session.read()).toBeNull()
    })

    test('requires active org', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      await writeCliSession(session)

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
      await writeCliSession(session, org.id)

      const { output } = await serve(['org', 'invite', 'create'])
      expect(output).toContain('/invite/')
      expect(output).toContain('member')
      expect(output).toContain('0/')
      expect(output).toContain('expires')
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
      await writeCliSession(session, org.id)

      const { output } = await serve([
        'org',
        'invite',
        'create',
        '--role',
        'admin',
        '--max-uses',
        '5',
      ])
      expect(output).toContain('/invite/')
      expect(output).toContain('admin')
      expect(output).toContain('0/5')
      expect(output).toContain('expires')
      // callout suppressed in non-TTY
    })

    test('create - non-TTY outputs tab-delimited summary without callout', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      const org = await factory.organization.insert({})
      await factory.organization_member.insert({
        organization_id: org.id,
        account_id: account.id,
        role: 'owner',
      })
      await writeCliSession(session, org.id)

      const { output } = await serve(['org', 'invite', 'create'])
      // Summary: tab-delimited key:value
      expect(output).toContain('url:\t')
      expect(output).toContain('role:\t')
      expect(output).toContain('uses:\t')
      expect(output).toContain('expires:\t')
      // No callout in non-TTY
      expect(output).not.toContain('Share this link')
      expect(output).not.toContain('!')
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
      await writeCliSession(session, org.id)

      const { exitCode, output } = await serve(['org', 'invite', 'create'])
      expect(exitCode).toBe(1)
      expect(output).toContain('FORBIDDEN')
    })
  })

  describe('list', () => {
    test('requires active org', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      await writeCliSession(session)

      const { exitCode, output } = await serve(['org', 'invite', 'list'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_ACTIVE_ORG')
    })

    test('expired session deletes session', async () => {
      Session.write({ refresh_token: 'expired-refresh-token', organization_id: 'stale' })

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
      await writeCliSession(session, org.id)

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
      await writeCliSession(session, org.id)

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
      await writeCliSession(session, org.id)

      const { output } = await serve(['org', 'invite', 'list'])
      expect(output).toContain(invite.token.slice(0, 12))
    })
  })

  describe('revoke', () => {
    test('requires active org', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      await writeCliSession(session)

      const { exitCode, output } = await serve(['org', 'invite', 'revoke', 'some-id'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_ACTIVE_ORG')
    })

    test('expired session deletes session', async () => {
      Session.write({ refresh_token: 'expired-refresh-token', organization_id: 'stale' })

      const { exitCode, output } = await serve(['org', 'invite', 'revoke', 'some-id', '--force'])
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
      await writeCliSession(session, org.id)

      const { exitCode, output } = await serve(['org', 'invite', 'revoke'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_INPUT')
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
      await writeCliSession(session, org.id)

      const { output } = await serve(['org', 'invite', 'revoke', invite.id, '--force'])
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
      await writeCliSession(session, org.id)

      const { exitCode, output } = await serve(['org', 'invite', 'revoke', 'fake-id', '--force'])
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
      await writeCliSession(session)

      const { exitCode, output } = await serve(['org', 'member', 'add', 'someone'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_ACTIVE_ORG')
    })

    test('expired session deletes session', async () => {
      Session.write({ refresh_token: 'expired-refresh-token', organization_id: 'stale' })

      const { exitCode, output } = await serve(['org', 'member', 'add', 'someone'])
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
      await writeCliSession(session, org.id)

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
      await writeCliSession(session, org.id)

      const { output } = await serve(['org', 'member', 'add', target.login, '--role', 'admin'])
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
      await writeCliSession(session, org.id)

      const { exitCode, output } = await serve(['org', 'member', 'add', target.login])
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
      await writeCliSession(session, org.id)

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
      await writeCliSession(session, org.id)

      const { exitCode, output } = await serve(['org', 'member', 'add', 'nonexistent-login'])
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
      await writeCliSession(session, org.id)

      const { exitCode, output } = await serve(['org', 'member', 'add', target.login])
      expect(exitCode).toBe(1)
      expect(output).toContain('ALREADY_MEMBER')
    })
  })

  describe('list', () => {
    test('requires active org', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      await writeCliSession(session)

      const { exitCode, output } = await serve(['org', 'member', 'list'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_ACTIVE_ORG')
    })

    test('expired session deletes session', async () => {
      Session.write({ refresh_token: 'expired-refresh-token', organization_id: 'stale' })

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
      await writeCliSession(session, org.id)

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
      await writeCliSession(session, org.id)

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
      await writeCliSession(session, org.id)

      const { output } = await serve(['org', 'member', 'list'])
      expect(output).toContain(owner.login)
    })
  })

  describe('remove', () => {
    test('requires active org', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      await writeCliSession(session)

      const { exitCode, output } = await serve(['org', 'member', 'remove', 'someone'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NO_ACTIVE_ORG')
    })

    test('expired session deletes session', async () => {
      Session.write({ refresh_token: 'expired-refresh-token', organization_id: 'stale' })

      const { exitCode, output } = await serve(['org', 'member', 'remove', 'someone'])
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
      await writeCliSession(session, org.id)

      const { output } = await serve(['org', 'member', 'remove', target.login, '--force'])
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
      await writeCliSession(session, org.id)

      const { exitCode, output } = await serve(['org', 'member', 'remove', owner.login, '--force'])
      expect(exitCode).toBe(1)
      expect(output).toContain('CANNOT_REMOVE_OWNER')
      expect(output).toContain('Cannot remove owner')
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
      await writeCliSession(session, org.id)

      const { exitCode, output } = await serve(['org', 'member', 'remove', 'nonexistent-login'])
      expect(exitCode).toBe(1)
      expect(output).toContain('NOT_FOUND')
      expect(output).toContain('not found')
    })
  })

  describe('role', () => {
    test('requires active org', async () => {
      const account = await factory.account.insert({})
      const session = await factory.session.insert({ account_id: account.id })
      await writeCliSession(session)

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
      Session.write({ refresh_token: 'expired-refresh-token', organization_id: 'stale' })

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
      await writeCliSession(session, org.id)

      const { output } = await serve([
        'org',
        'member',
        'role',
        target.login,
        '--role',
        'admin',
        '--force',
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
      await writeCliSession(session, org.id)

      const { output } = await serve([
        'org',
        'member',
        'role',
        target.login,
        '--role',
        'admin',
        '--force',
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
      await writeCliSession(session, org.id)

      const { output } = await serve([
        'org',
        'member',
        'role',
        otherAdmin.login,
        '--role',
        'member',
        '--force',
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
      await writeCliSession(session, org.id)

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
      await writeCliSession(session, org.id)

      const { exitCode, output } = await serve([
        'org',
        'member',
        'role',
        otherOwner.login,
        '--role',
        'admin',
        '--force',
      ])
      expect(exitCode).toBe(1)
      expect(output).toContain('CANNOT_CHANGE_OWNER')
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

  test('list - empty shows create cta', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const { output } = await serve(['token', 'list'])
    expect(output).toContain('No tokens found')
    expect(output).toContain('token create')
  })

  test('create, list - full flow', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const { output: createOutput } = await serve(['token', 'create', 'my-token'])
    expect(createOutput).toContain('my-token')
    expect(createOutput).toContain('curlmd_')
    // callout suppressed in non-TTY

    const { output: listOutput } = await serve(['token', 'list'])
    expect(listOutput).toContain('my-token')
    expect(listOutput).toContain('curlmd_')
    expect(listOutput).toContain('never')
  })

  test('list - non-TTY outputs tab-separated values without headers', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    await serve(['token', 'create', 'pipe-test'])

    const { output } = await serve(['token', 'list'])
    const lines = output.trim().split('\n')
    // No header row — first line is data
    expect(lines[0]).toContain('\t')
    expect(lines[0]).toContain('pipe-test')
    expect(lines[0]).toContain('curlmd_')
    // Should NOT contain table headers
    expect(output).not.toContain('NAME')
    expect(output).not.toContain('KEY')
    expect(output).not.toContain('USED')
    expect(output).not.toContain('CREATED')
  })

  test('create - non-TTY outputs tab-delimited summary without callout', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const { output } = await serve(['token', 'create', 'pipe-create'])
    // Summary: tab-delimited key:value
    expect(output).toContain('name:\t')
    expect(output).toContain('token:\t')
    expect(output).toContain('pipe-create')
    expect(output).toContain('curlmd_')
    // No callout in non-TTY
    expect(output).not.toContain('Save this token')
    expect(output).not.toContain('!')
  })

  test('list - scopes to active org', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    const org = await factory.organization.insert({})
    await factory.organization_member.insert({
      organization_id: org.id,
      account_id: account.id,
    })

    // Create account-level token (no org)
    await writeCliSession(session)
    await serve(['token', 'create', 'account-token'])

    // Create org-scoped token
    await writeCliSession(session, org.id)
    await serve(['token', 'create', 'org-token'])

    // List with org active — should only show org token
    await writeCliSession(session, org.id)
    const { output: orgList } = await serve(['token', 'list'])
    expect(orgList).toContain('org-token')
    expect(orgList).not.toContain('account-token')

    // List without org — should only show account token
    await writeCliSession(session)
    const { output: acctList } = await serve(['token', 'list'])
    expect(acctList).toContain('account-token')
    expect(acctList).not.toContain('org-token')
  })

  test('create - duplicate name', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    await serve(['token', 'create', 'dupe'])
    const { exitCode, output } = await serve(['token', 'create', 'dupe'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NAME_TAKEN')
    expect(output).toContain('dupe')
  })

  test('list - empty', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const { output } = await serve(['token', 'list'])
    expect(output).toContain('No tokens found')
  })

  test('list - expired session deletes session', async () => {
    Session.write({ refresh_token: 'expired-refresh-token' })

    const { exitCode, output } = await serve(['token', 'list'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('create - expired session deletes session', async () => {
    Session.write({ refresh_token: 'expired-refresh-token' })

    const { exitCode, output } = await serve(['token', 'create', 'test'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('delete - expired session deletes session', async () => {
    Session.write({ refresh_token: 'expired-refresh-token' })

    const { exitCode, output } = await serve(['token', 'delete', 'test'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_AUTHENTICATED')
    expect(Session.read()).toBeNull()
  })

  test('delete - nonexistent token', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    await serve(['token', 'create', 'exists'])
    const { exitCode, output } = await serve(['token', 'delete', 'nope'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NOT_FOUND')
  })

  test('delete - success', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    await serve(['token', 'create', 'to-delete'])

    const { output } = await serve(['token', 'delete', 'to-delete', '--force'])
    expect(output).toContain('Token to-delete deleted.')

    const { output: listOutput } = await serve(['token', 'list'])
    expect(listOutput).toContain('No tokens found')
  })

  test('delete - no tokens', async () => {
    const account = await factory.account.insert({})
    const session = await factory.session.insert({ account_id: account.id })
    await writeCliSession(session)

    const { exitCode, output } = await serve(['token', 'delete', 'nope'])
    expect(exitCode).toBe(1)
    expect(output).toContain('NO_TOKENS')
  })
})

describe('update', () => {
  test('install fails', async () => {
    const standaloneSpy = vi.spyOn(utils, 'isStandalone').mockReturnValue(false)
    const spy = vi.spyOn(utils, 'installGlobal').mockRejectedValue(new Error('permission denied'))
    onTestFinished(() => {
      standaloneSpy.mockRestore()
      spy.mockRestore()
    })

    const { exitCode, output } = await serve(['update', '--target', '99.0.0'])
    expect(exitCode).toBe(1)
    expect(output).toContain('UPDATE_FAILED')
    expect(output).toContain('permission denied')
  })

  test('standalone download failure', async () => {
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

  test('already up to date', async () => {
    const spy = vi.spyOn(utils, 'compareVersions').mockReturnValue(0)
    onTestFinished(() => spy.mockRestore())

    const { output } = await serve(['update', '--target', '0.0.1'])
    expect(output).toContain('Already up-to-date')
  })

  test('cannot determine latest version', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error())
    onTestFinished(() => fetchSpy.mockRestore())

    const { exitCode, output } = await serve(['update'])
    expect(exitCode).toBe(1)
    expect(output).toContain('UPDATE_FAILED')
    expect(output).toContain('Could not determine latest version')
  })
})

async function writeCliSession(session: Pick<DB.session, 'account_id'>, organizationId?: string) {
  const json = await SessionToken.createCliSession(db, session.account_id)
  Session.write({
    organization_id: organizationId,
    refresh_token: json.refresh_token,
    refresh_token_expires_at: json.refresh_token_expires_at,
  })
}
