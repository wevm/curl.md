import { hc } from 'hono/client'
import { Cli, z } from 'incur'
import pc from 'picocolors'
import type { api } from '../../src/api.ts'
import pkg from '../package.json' with { type: 'json' }
import { createSpinner, openUrl, Session } from './utils.ts'

const cli = Cli.create('curl.md', {
  description: 'Fetch any web page and convert it to markdown.',
  version: pkg.version,
  env: z.object({
    CURL_MD_BASE_URL: z
      .string()
      .default('https://curl.md')
      .describe('Base URL'),
  }),
  vars: z.object({
    client: z.custom<ReturnType<typeof hc<typeof api>>>(),
    session: z.custom<{ session_id: string } | null>(),
  }),
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
  async run(c) {
    const url =
      c.args.url ??
      (await (async () => {
        if (process.stdin.isTTY) return undefined
        let data = ''
        for await (const chunk of process.stdin) data += chunk
        return data.trim() || undefined
      })())
    if (!url)
      return c.error({
        code: 'MISSING_URL',
        message: 'No URL provided.',
        cta: {
          description: 'Try:',
          commands: [
            {
              command: c.name,
              args: { url: 'example.com' },
              description: 'Fetch a page',
            },
            {
              command: c.name,
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
      return c.error({
        code: 'INVALID_URL',
        message: `Invalid URL: ${url}`,
        cta: {
          description: 'URL must be a valid HTTP(S) address:',
          commands: [
            {
              command: c.name,
              args: { url: 'example.com' },
              description: 'Domain without protocol',
            },
            {
              command: c.name,
              args: { url: 'https://example.com/path' },
              description: 'Full URL with protocol',
            },
          ],
        },
      })

    const keywords = c.options.keywords?.flatMap((k: string) => k.split(','))
    const res = await c.var.client.api[':url{.+}'].$get({
      param: { url: url },
      query: {
        fresh: c.options.fresh ? '' : undefined,
        k: keywords?.join(','),
        q: c.options.objective,
      },
    })
    const text = await res.text()

    if (!res.ok) return c.error({ code: 'FETCH_FAILED', message: text })

    if (!c.options.objective)
      return c.ok(text, {
        cta: {
          description: 'Narrow results with an objective:',
          commands: [
            {
              command: c.name,
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

cli.use(async (c, next) => {
  const session = Session.read()
  c.set('session', session)
  c.set(
    'client',
    hc<typeof api>(c.env.CURL_MD_BASE_URL, {
      headers: session
        ? { Authorization: `Bearer ${session.session_id}` }
        : ({} as Record<string, string>),
    }),
  )
  return next()
})

const auth = Cli.create('auth', {
  description: 'Authentication commands',
  vars: z.object({
    client: z.custom<ReturnType<typeof hc<typeof api>>>(),
    session: z.custom<{ session_id: string } | null>(),
  }),
})
  .command('login', {
    description: 'Log in to curl.md',
    output: z.string(),
    format: 'md',
    async run(c) {
      if (c.var.session) {
        const res = await c.var.client.api.auth.me.$get()
        const data = await res.json()
        if (data.account)
          return c.error({
            code: 'ALREADY_LOGGED_IN',
            message: 'You are already authenticated.',
          })
      }

      const deviceRes = await c.var.client.api.auth.device.$post()
      const device = await deviceRes.json()

      const url = `${device.verification_uri}?user_code=${device.user_code}`
      openUrl(url)

      console.log(
        `\n${pc.bold('Confirmation Code:')} ${pc.green(device.user_code)}\n`,
      )
      console.log(
        `If something goes wrong, copy and paste this URL into your browser: ${pc.bold(url)}\n`,
      )

      const spinner = createSpinner('Waiting for authentication...')
      const interval = (device.interval ?? 5) * 1000
      try {
        while (true) {
          const tokenRes = await c.var.client.api.auth.device.token.$post({
            json: { device_code: device.device_code },
          })
          const tokenData = await tokenRes.json()
          if ('error' in tokenData) {
            if (tokenData.error === 'authorization_pending') {
              await new Promise((r) => setTimeout(r, interval))
              continue
            }
            spinner.stop()
            return c.error({ code: 'AUTH_FAILED', message: tokenData.error })
          }
          if ('session_id' in tokenData) {
            spinner.stop()
            Session.write(tokenData.session_id)
            return 'Successfully logged in.'
          }
        }
      } catch (error) {
        spinner.stop()
        throw error
      }
    },
  })
  .command('logout', {
    description: 'Log out of curl.md',
    output: z.string(),
    format: 'md',
    async run(c) {
      if (!c.var.session) return 'Already logged out.'

      await new Promise<void>((resolve) => {
        process.stdout.write(`Press Enter to log out of ${c.name} CLI.`)
        process.stdin.once('data', () => {
          process.stdin.pause()
          resolve()
        })
        process.stdin.resume()
      })

      Session.delete()
      return 'Successfully logged out.'
    },
  })
  .command('check', {
    description: 'Check authentication status',
    output: z.string(),
    format: 'md',
    async run(c) {
      const notAuthenticated = {
        code: 'NOT_AUTHENTICATED',
        message: 'You are not authenticated.',
        cta: {
          description: 'Log in:',
          commands: [
            {
              command: `${c.name} auth login`,
              description: `Authenticate with ${c.name}`,
            },
          ],
        },
      }

      if (!c.var.session) return c.error(notAuthenticated)

      const res = await c.var.client.api.auth.me.$get()
      const data = await res.json()
      if (!data.account) {
        Session.delete()
        return c.error(notAuthenticated)
      }
      return 'You are authenticated.'
    },
  })

cli.command(auth)

export default cli
