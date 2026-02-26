#!/usr/bin/env node
import { Cli, z } from 'incur'
import pkg from '../package.json' with { type: 'json' }

const version = process.env.CURL_MD_VERSION ?? pkg.version

const cli = Cli.create('curl.md', {
  description: 'Fetch a web page and convert it to markdown.',
  version,
  usage: [
    { suffix: '<url> [options]' },
    { prefix: 'echo <url> |', suffix: '[options]' },
  ],
  args: z.object({
    url: z.string().optional().describe('URL to fetch'),
  }),
  options: z.object({
    fresh: z.boolean().optional().describe('Force fresh fetch (bypass cache)'),
    keywords: z
      .array(z.string())
      .optional()
      .describe('Pre-filter by keywords (comma-separated)'),
    objective: z
      .string()
      .optional()
      .describe('Narrow content to a specific objective'),
  }),
  alias: { fresh: 'f', keywords: 'k', objective: 'q' },
  env: z.object({
    CURL_MD_BASE_URL: z
      .string()
      .default('https://curl.md')
      .describe('Base URL'),
  }),
  examples: [
    { args: { url: 'example.com' } },
    {
      args: { url: 'example.com' },
      options: { objective: 'pricing plans' },
    },
    {
      args: { url: 'example.com' },
      options: { keywords: ['api,auth'] },
    },
    {
      args: { url: 'example.com' },
      options: { objective: 'authentication', keywords: ['oauth,jwt'] },
    },
    {
      args: {
        url: 'docs.github.com/en/webhooks/webhook-events-and-payloads',
      },
      options: {
        objective: 'pull request webhook event payload and actions',
        keywords: ['pull_request'],
      },
    },
    {
      args: {
        url: 'developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch',
      },
      options: {
        objective: 'streaming response body',
        keywords: ['ReadableStream,getReader'],
      },
    },
    {
      args: { url: 'developers.cloudflare.com/d1/get-started' },
      options: {
        objective: 'how to query D1 from a worker',
        keywords: ['D1,bindings'],
      },
    },
    {
      args: { url: 'ai-sdk.dev/docs/ai-sdk-core/generating-text' },
      options: {
        objective: 'how to stream text with the ai sdk',
        keywords: ['streamText,generateText'],
      },
    },
  ],
  output: z.string().describe('Page content as markdown'),
  format: 'md',
  async run({ args, options, env, error, ok }) {
    const url = args.url ?? (await readStdin())
    if (!url)
      return error({
        code: 'MISSING_URL',
        message: 'No URL provided.',
        cta: {
          description: 'Try:',
          commands: [
            {
              command: 'curl.md',
              args: { url: 'example.com' },
              description: 'Fetch a page',
            },
            {
              command: 'curl.md',
              args: { url: 'example.com' },
              options: { objective: 'pricing plans' },
              description: 'Narrow to a topic',
            },
          ],
        },
      })

    const result = z.safeParse(
      z
        .string()
        .transform((arg) => (arg.includes('://') ? arg : `https://${arg}`))
        .pipe(
          z.url({
            hostname: z.regexes.domain,
            normalize: true,
            protocol: /^https?$/,
          }),
        ),
      url,
    )
    if (!result.success)
      return error({
        code: 'INVALID_URL',
        message: `Invalid URL: ${url}`,
        cta: {
          description: 'URL must be a valid HTTP(S) address:',
          commands: [
            {
              command: 'curl.md',
              args: { url: 'example.com' },
              description: 'Domain without protocol',
            },
            {
              command: 'curl.md',
              args: { url: 'https://example.com/path' },
              description: 'Full URL with protocol',
            },
          ],
        },
      })

    const params = new URLSearchParams()
    if (options.objective) params.set('q', options.objective)
    const keywords = options.keywords?.flatMap((k) => k.split(','))
    if (keywords?.length) params.set('k', keywords.join(','))
    if (options.fresh) params.set('fresh', '')

    const query = params.toString()
    const target = `${env.CURL_MD_BASE_URL}/${url}${query ? `?${query}` : ''}`

    const res = await fetch(target)
    const text = await res.text()

    if (!res.ok) return error({ code: 'FETCH_FAILED', message: text })

    if (!options.objective)
      return ok(text, {
        cta: {
          description: 'Narrow results with an objective:',
          commands: [
            {
              command: 'curl.md',
              args: { url },
              options: { objective: true },
              description: 'Focus on a specific topic',
            },
          ],
        },
      })

    return text
  },
})

cli.serve()

export default cli

async function readStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined
  let data = ''
  for await (const chunk of process.stdin) data += chunk
  return data.trim() || undefined
}
