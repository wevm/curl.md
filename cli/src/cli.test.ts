import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterEach, expect, test } from 'vitest'

const exec = promisify(execFile)
const cli = resolve(import.meta.dirname, '..', 'dist', 'cli.js')
const env = { ...process.env, CURL_MD_VERSION: 'x.y.z' }

test('fetches example.com as markdown', async () => {
  const { stdout } = await exec('node', [cli, 'example.com'], {
    env,
    timeout: 30_000,
  })
  expect(stdout).toContain('Example Domain')
})

test('fetches example.com as json', async () => {
  const { stdout } = await exec('node', [cli, 'example.com', '--json'], {
    env,
    timeout: 30_000,
  })
  const json = JSON.parse(stdout)
  const content = json.data ?? json.content ?? json
  expect(
    typeof content === 'string' ? content : JSON.stringify(content),
  ).toContain('Example Domain')
})

test('prints version', async () => {
  const { stdout } = await exec('node', [cli, '--version'], { env })
  expect(stdout.trim()).toBe('x.y.z')
})

test('prints help', async () => {
  const { stdout } = await exec('node', [cli, '--help'], { env })
  expect(stdout).toMatchInlineSnapshot(`
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
      --format <toon|json|yaml|md>  Output format
      --help                        Show help
      --llms                        Print LLM-readable manifest
      --mcp                         Start as MCP stdio server
      --verbose                     Show full output envelope
      --version                     Show version
    "
  `)
})

test('exits with error for invalid url', async () => {
  await expect(exec('node', [cli, '!!!invalid'], { env })).rejects.toThrow()
})

// MCP

let client: Client | undefined
afterEach(async () => {
  await client?.close()
  client = undefined
})

async function createMcpClient() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [cli, '--mcp'],
    env,
  })
  client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(transport)
  if (!client) throw new Error('client not initialized')
  return client
}

test('mcp: lists curl.md tool', async () => {
  const client = await createMcpClient()
  const { tools } = await client.listTools()
  expect(tools).toHaveLength(1)
  expect(tools[0]).toMatchObject({ name: 'curl.md' })
})

test('mcp: fetches example.com', async () => {
  const client = await createMcpClient()
  const result = await client.callTool({
    name: 'curl.md',
    arguments: { url: 'example.com' },
  })
  expect(result.isError).toBeFalsy()
  expect(result.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        text: expect.stringContaining('Example Domain'),
      }),
    ]),
  )
})
