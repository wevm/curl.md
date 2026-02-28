import { spawn } from 'node:child_process'
import { beforeAll, expect, inject, test, vi } from 'vitest'
import { Env } from '../../test/env.ts'
import cli from './cli.ts'

vi.mock('../package.json', () => ({ default: { version: 'x.y.z' } }))

let baseUrl: string
beforeAll(async () => {
  const env = Env.parse(inject('env'))
  const proc = spawn('pnpm', ['vite', 'dev'], {
    cwd: process.cwd(),
    env: { ...process.env, DB_URL: env.DB_URL },
    stdio: 'pipe',
  })

  baseUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill()
      reject(
        new Error(
          `Dev server startup timeout\nstdout: ${stdout}\nstderr: ${stderr}`,
        ),
      )
    }, 90_000)

    let stderr = ''
    let stdout = ''
    const checkForUrl = (chunk: string) => {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape codes
      const clean = chunk.replace(/\x1b\[[0-9;]*m/g, '')
      const match = clean.match(/Local:\s+(http:\/\/localhost:\d+)/)
      if (!match) return
      clearTimeout(timeout)
      resolve(match[1]!)
    }
    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
      checkForUrl(data.toString())
    })
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
      checkForUrl(data.toString())
    })
    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
    proc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout)
        reject(new Error(`Dev server exited with code ${code}\n${stderr}`))
      }
    })
  })

  process.env.CURL_MD_BASE_URL = baseUrl
  return () => proc.kill()
})

async function serve(
  argv: string[],
  overrides?: Record<string, string | undefined>,
) {
  let output = ''
  let exitCode: number | undefined
  await cli.serve(argv, {
    env: { CURL_MD_BASE_URL: baseUrl, ...overrides },
    stdout(s: string) {
      output += s
    },
    exit(code: number) {
      exitCode = code
    },
  })
  return { output, exitCode }
}

test('fetches example.com as markdown', async () => {
  const { output } = await serve(['example.com'])
  expect(output).toContain('Example Domain')
}, 30_000)

test('fetches example.com as json', async () => {
  const { output } = await serve(['example.com', '--json'])
  const json = JSON.parse(output)
  const content = json.data ?? json.content ?? json
  expect(
    typeof content === 'string' ? content : JSON.stringify(content),
  ).toContain('Example Domain')
}, 30_000)

test('prints version', async () => {
  const { output } = await serve(['--version'])
  expect(output).toMatchInlineSnapshot(`
  	"x.y.z
  	"
  `)
})

test('prints help', async () => {
  const { output } = await serve(['--help'])
  expect(output).toMatchInlineSnapshot(`
		"curl.md — Fetch a web page and convert it to markdown.
		vx.y.z

		Usage: curl.md <url> [options]
		       echo <url> | curl.md [options]

		Arguments:
		  url  URL to fetch

		Options:
		  --fresh, -f <boolean>     Force fresh fetch (bypass cache)
		  --keywords, -k <array>    Pre-filter by keywords (comma-separated)
		  --objective, -q <string>  Narrow content to a specific objective

		Environment Variables:
		  CURL_MD_BASE_URL  Base URL (default: https://curl.md)

		Examples:
		  $ curl.md example.com
		  $ curl.md example.com --objective pricing plans
		  $ curl.md example.com --keywords api,auth
		  $ curl.md example.com --objective authentication --keywords oauth,jwt
		  $ curl.md docs.github.com/en/webhooks/webhook-events-and-payloads --objective pull request webhook event payload and actions --keywords pull_request
		  $ curl.md developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch --objective streaming response body --keywords ReadableStream,getReader
		  $ curl.md developers.cloudflare.com/d1/get-started --objective how to query D1 from a worker --keywords D1,bindings
		  $ curl.md ai-sdk.dev/docs/ai-sdk-core/generating-text --objective how to stream text with the ai sdk --keywords streamText,generateText

		Built-in Commands:
		  mcp add     Register as an MCP server
		  skills add  Sync skill files to your agent

		Global Options:
		  --format <toon|json|yaml|md|jsonl>  Output format
		  --help                              Show help
		  --llms                              Print LLM-readable manifest
		  --mcp                               Start as MCP stdio server
		  --verbose                           Show full output envelope
		  --version                           Show version
		"
	`)
})

test('exits with error for invalid url', async () => {
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

test('exits with error for missing url', async () => {
  const orig = process.stdin.isTTY
  Object.defineProperty(process.stdin, 'isTTY', {
    value: true,
    configurable: true,
  })
  try {
    const { exitCode, output } = await serve([])
    expect(exitCode).toBe(1)
    expect(output).toMatchInlineSnapshot(`
      "## code

      MISSING_URL

      ## message

      No URL provided.

      ## cta.description

      Try:

      ## cta.commands

      | command                                       | description       |
      |-----------------------------------------------|-------------------|
      | curl.md example.com                           | Fetch a page      |
      | curl.md example.com --objective pricing plans | Narrow to a topic |
      "
    `)
  } finally {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: orig,
      configurable: true,
    })
  }
})
