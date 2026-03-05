import { hc } from 'hono/client'
import { Cli, middleware, z } from 'incur'
import type { api } from '../../src/api.ts'
import pkg from '../package.json' with { type: 'json' }
import { pc } from './picocolors.ts'
import {
  type Client,
  type Command,
  compareVersions,
  createSpinner,
  formatValidationError,
  installGlobal,
  isStandalone,
  openUrl,
  relativeTime,
  Session,
  select,
  UpdateCache,
  updateStandalone,
} from './utils.ts'

const vars = z.object({
  client: z.custom<Client>(),
  commands: z.custom<Command[]>(),
  session: z.custom<Session.Data | null>(),
})

const cli = Cli.create('curl.md', {
  description: 'Fetch any URL as Markdown',
  version: pkg.version,
  env: z.object({
    CURL_MD_BASE_URL: z
      .string()
      .default('https://curl.md')
      .describe('Base URL'),
  }),
  vars,
  usage: [{ suffix: '<url> [options]' }],
  args: z.object({
    url: z.string().describe('URL to fetch'),
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
    {
      args: { url: 'zod.dev/error-formatting' },
      options: {
        objective: 'tree error formatting',
        keywords: ['treeifyError'],
      },
    },
  ],
  output: z.string().describe('Page content as markdown'),
  format: 'md',
  async run(c) {
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
      c.args.url,
    )
    if (!result.success)
      return c.error({
        code: 'INVALID_URL',
        message: `Invalid URL: ${c.args.url}`,
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
            ...c.var.commands,
          ],
        },
      })

    const keywords = c.options.keywords?.flatMap((k: string) => k.split(','))
    const res = await c.var.client.api[':url{.+}'].$get({
      param: { url: result.data },
      query: {
        fresh: c.options.fresh ? '' : undefined,
        k: keywords?.join(','),
        q: c.options.objective,
      },
    })

    if (res.status === 400) {
      const json = await res.json()
      return c.error({
        code: 'VALIDATION_ERROR',
        message: formatValidationError(json),
      })
    }

    if (res.status === 403) {
      Session.write({ organization_id: undefined })
      return c.error({
        code: 'ORG_ACCESS_DENIED',
        message:
          'Active organization no longer accessible. Switched to personal.',
        cta: {
          description: 'Switch organization:',
          commands: [
            {
              command: `${c.name} org switch`,
              description: 'Switch active organization',
            },
            ...c.var.commands,
          ],
        },
      })
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after')
      const message = retryAfter
        ? `Rate limit exceeded. Try again in ${retryAfter}s.`
        : 'Rate limit exceeded. Try again later.'
      return c.error({
        code: 'RATE_LIMITED',
        message,
        cta: {
          description: 'Authenticate for higher limits:',
          commands: [
            ...(!c.var.session
              ? [
                  {
                    command: `${c.name} auth login`,
                    description: 'Log in for higher rate limits',
                  },
                ]
              : []),
            ...c.var.commands,
          ],
        },
      })
    }

    const text = await res.text()
    if (!res.ok) {
      let message = text
      try {
        const json = JSON.parse(text)
        if (json.message) message = json.message
      } catch {}
      return c.error({ code: 'FETCH_FAILED', message })
    }

    if (!c.options.objective)
      return c.ok(text, {
        cta: {
          description: 'Narrow results with an objective:',
          commands: [
            {
              command: c.name,
              args: { url: result.data },
              options: { objective: true },
              description: 'Focus on a specific topic',
            },
            ...c.var.commands,
          ],
        },
      })

    return c.ok(text, {
      cta: { commands: c.var.commands },
    })
  },
})

cli.use(async (c, next) => {
  const session = Session.read()
  c.set('session', session)
  const headers: Record<string, string> = {}
  if (session) {
    headers.Authorization = `Bearer ${session.session_id}`
    if (session.organization_id)
      headers['x-organization-id'] = session.organization_id
  }
  c.set('client', hc<typeof api>(c.env.CURL_MD_BASE_URL, { headers }))
  return next()
})

// Non-blocking update check: read cache from a previous run, spawn background
// refresh if stale, set commands var for CTA — never blocks on network.
const staleMs = 1000 * 60 * 60 // 1 hour
cli.use((c, next) => {
  const cache = UpdateCache.read()
  const stale = !cache || Date.now() - cache.checked_at > staleMs
  if (stale) UpdateCache.spawnCheck()

  const commands = c.var.commands ?? []
  if (cache && compareVersions(cache.latest, pkg.version) > 0) {
    let description = `Update available: ${pkg.version} → ${cache.latest}`
    if (cache.released_at) {
      const ago = relativeTime(new Date(cache.released_at))
      if (ago) description += ` (released ${ago})`
    }
    commands.push({ command: `${c.name} update`, description })
  }
  c.set('commands', commands)

  return next()
})

const requireAuth = middleware<typeof vars>((c, next) => {
  if (!c.var.session)
    return c.error({
      ...notAuthenticated,
      cta: {
        description: 'Log in:',
        commands: [
          {
            command: `${c.name} auth login`,
            description: `Authenticate with ${c.name}`,
          },
          ...c.var.commands,
        ],
      },
    })
  return next()
})
const notAuthenticated = {
  code: 'NOT_AUTHENTICATED',
  message: 'You are not authenticated.',
}

const auth = Cli.create('auth', {
  description: 'Authentication commands',
  vars,
})
  .command('check', {
    description: 'Check if you are authenticated',
    middleware: [requireAuth],
    output: z.string(),
    format: 'md',
    async run(c) {
      const res = await c.var.client.api.auth.me.$get()
      const json = await res.json()
      if (!json.account) {
        Session.delete()
        return c.error({
          ...notAuthenticated,
          cta: {
            description: 'Log in:',
            commands: [
              {
                command: `${c.name} auth login`,
                description: `Authenticate with ${c.name}`,
              },
              ...c.var.commands,
            ],
          },
        })
      }
      return c.ok('You are authenticated.')
    },
  })
  .command('login', {
    description: 'Authenticate with the curl.md CLI',
    output: z.string(),
    format: 'md',
    async run(c) {
      if (c.var.session) {
        const res = await c.var.client.api.auth.me.$get()
        const json = await res.json()
        if (json.account)
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
        `If something goes wrong, copy and paste this URL into your browser:\n${pc.bold(url)}\n`,
      )

      const spinner = createSpinner('Waiting for authentication...')
      const interval = (device.interval ?? 5) * 1000
      try {
        while (true) {
          const res = await c.var.client.api.auth.device.token.$post({
            json: { code: device.code },
          })
          if (res.status === 400) {
            const json = await res.json()
            if (json.error === 'authorization_pending') {
              await new Promise((r) => setTimeout(r, interval))
              continue
            }
            spinner.stop()
            return c.error({
              code: 'AUTH_FAILED',
              message: formatValidationError(json, json.error),
            })
          }
          const json = await res.json()
          spinner.stop()
          Session.write({ session_id: json.session_id })
          return c.ok('Successfully logged in.')
        }
      } catch (error) {
        spinner.stop()
        throw error
      }
    },
  })
  .command('logout', {
    description: 'Log out of the curl.md CLI',
    output: z.string(),
    format: 'md',
    async run(c) {
      if (!c.var.session) return c.ok('Already logged out.')

      await new Promise<void>((resolve) => {
        process.stdout.write(`Press Enter to log out of ${c.name} CLI`)
        process.stdin.once('data', () => {
          process.stdin.pause()
          resolve()
        })
        process.stdin.resume()
      })

      Session.delete()
      return c.ok('Successfully logged out.')
    },
  })

const org = Cli.create('org', {
  description: 'Manage organizations (create, list, show, switch)',
  vars,
})
  .command('create', {
    description: 'Create organization',
    middleware: [requireAuth],
    args: z.object({
      login: z.string().describe('Organization login (e.g. "wevm")'),
    }),
    options: z.object({
      name: z.string().optional().describe('Display name (defaults to login)'),
    }),
    output: z.string(),
    format: 'md',
    async run(c) {
      const res = await c.var.client.api.orgs.$post({
        json: { login: c.args.login, name: c.options.name },
      })
      if (res.status === 400) {
        const json = await res.json()
        return c.error({
          code: 'VALIDATION_ERROR',
          message: formatValidationError(json, json.error),
        })
      }
      if (res.status === 401) {
        Session.delete()
        return c.error({
          ...notAuthenticated,
          cta: {
            description: 'Log in:',
            commands: [
              {
                command: `${c.name} auth login`,
                description: `Authenticate with ${c.name}`,
              },
              ...c.var.commands,
            ],
          },
        })
      }

      if (res.status === 409) {
        const json = await res.json()
        return c.error({ code: 'CREATE_FAILED', message: json.error })
      }

      const json = await res.json()
      return c.ok(`Created organization ${json.login}.`, {
        cta: {
          description: 'Switch to it:',
          commands: [
            {
              command: `${c.name} org switch ${json.login}`,
              description: `Switch to ${json.login}`,
            },
            ...c.var.commands,
          ],
        },
      })
    },
  })
  .command('list', {
    description: 'List organizations',
    middleware: [requireAuth],
    output: z.string(),
    format: 'md',
    async run(c) {
      const res = await c.var.client.api.orgs.$get()
      if (res.status === 401) {
        Session.delete()
        return c.error({
          ...notAuthenticated,
          cta: {
            description: 'Log in:',
            commands: [
              {
                command: `${c.name} auth login`,
                description: `Authenticate with ${c.name}`,
              },
              ...c.var.commands,
            ],
          },
        })
      }

      const json = await res.json()
      // biome-ignore lint/style/noNonNullAssertion: middleware handles
      let activeId = c.var.session!.organization_id

      const lines: string[] = []
      if (activeId && !json.organizations.some((org) => org.id === activeId)) {
        Session.write({ organization_id: undefined })
        activeId = undefined
        lines.push(
          pc.yellow(
            'Active organization no longer accessible. Switched to personal.',
          ),
        )
      }

      if (activeId) lines.push(`  personal ${pc.dim('(no organization)')}`)
      else lines.push(`${pc.bold('*')} personal ${pc.dim('(no organization)')}`)

      for (const org of json.organizations) {
        if (org.id === activeId) lines.push(`${pc.bold('*')} ${org.login}`)
        else lines.push(`  ${org.login}`)
      }
      return c.ok(lines.join('\n'))
    },
  })
  .command('show', {
    description: 'Show active organization',
    middleware: [requireAuth],
    output: z.string(),
    format: 'md',
    async run(c) {
      // biome-ignore lint/style/noNonNullAssertion: middleware handles
      const orgId = c.var.session!.organization_id
      if (!orgId) return c.ok(`personal ${pc.dim('(no organization)')}`)

      const res = await c.var.client.api.orgs[':id'].$get({
        param: { id: orgId },
      })
      if (res.status === 401) {
        Session.delete()
        return c.error({
          ...notAuthenticated,
          cta: {
            description: 'Log in:',
            commands: [
              {
                command: `${c.name} auth login`,
                description: `Authenticate with ${c.name}`,
              },
              ...c.var.commands,
            ],
          },
        })
      }

      if (res.status === 404) {
        Session.write({ organization_id: undefined })
        return c.ok(
          'Active organization no longer accessible. Switched to personal.',
        )
      }

      const json = await res.json()
      return c.ok(`${json.organization.login} (${json.organization.name})`)
    },
  })
  .command('switch', {
    description: 'Switch active organization',
    middleware: [requireAuth],
    args: z.object({
      login: z
        .string()
        .optional()
        .describe('Organization login to switch to (or "personal")'),
    }),
    output: z.string(),
    format: 'md',
    async run(c) {
      const res = await c.var.client.api.orgs.$get()
      if (res.status === 401) {
        Session.delete()
        return c.error({
          ...notAuthenticated,
          cta: {
            description: 'Log in:',
            commands: [
              {
                command: `${c.name} auth login`,
                description: `Authenticate with ${c.name}`,
              },
              ...c.var.commands,
            ],
          },
        })
      }

      const json = await res.json()
      if (c.args.login) {
        if (c.args.login === 'personal') {
          Session.write({ organization_id: undefined })
          return c.ok('Switched to personal (no organization).')
        }
        const match = json.organizations.find((o) => o.login === c.args.login)
        if (!match)
          return c.error({
            code: 'ORG_NOT_FOUND',
            message: `Organization "${c.args.login}" not found.`,
          })
        Session.write({ organization_id: match.id })
        return c.ok(`Switched to ${match.login}.`)
      }

      const choices = [
        { label: `personal ${pc.dim('(no organization)')}`, id: undefined },
        ...json.organizations.map((o) => ({ label: o.login, id: o.id })),
      ]

      const index = await select(
        'Switch to:',
        choices.map((c) => c.label),
      )
      if (index === -1)
        return c.error({
          code: 'INVALID_SELECTION',
          message: 'Selection cancelled.',
        })

      const selected = choices[index]
      if (!selected)
        return c.error({
          code: 'INVALID_SELECTION',
          message: 'Invalid selection.',
        })
      Session.write({ organization_id: selected.id })
      return c.ok(
        `Switched to ${selected.id ? selected.label : 'personal (no organization)'}.`,
      )
    },
  })

const token = Cli.create('token', {
  description: 'Manage API tokens',
  vars,
})
  .command('create', {
    description: 'Create a new API token',
    middleware: [requireAuth],
    args: z.object({
      name: z.string().describe('Name for the token'),
    }),
    output: z.string(),
    format: 'md',
    async run(c) {
      const res = await c.var.client.api.tokens.$post({
        json: { name: c.args.name },
      })

      if (res.status === 401) {
        Session.delete()
        return c.error({
          ...notAuthenticated,
          cta: {
            description: 'Log in:',
            commands: [
              {
                command: `${c.name} auth login`,
                description: `Authenticate with ${c.name}`,
              },
              ...c.var.commands,
            ],
          },
        })
      }

      if (res.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: 'Cannot create tokens when authenticated with an API token.',
        })

      if (res.status === 409)
        return c.error({
          code: 'NAME_TAKEN',
          message: `Token "${c.args.name}" already exists.`,
        })

      if (res.status !== 201)
        return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

      const json = await res.json()
      return c.ok(
        [
          `Token created: ${json.api_key.name}`,
          '',
          `  ${json.api_key.token}`,
          '',
          pc.yellow("Save this — it won't be shown again."),
        ].join('\n'),
      )
    },
  })
  .command('list', {
    description: 'List API tokens',
    middleware: [requireAuth],
    output: z.string(),
    format: 'md',
    async run(c) {
      const res = await c.var.client.api.tokens.$get()

      if (res.status === 401) {
        Session.delete()
        return c.error({
          ...notAuthenticated,
          cta: {
            description: 'Log in:',
            commands: [
              {
                command: `${c.name} auth login`,
                description: `Authenticate with ${c.name}`,
              },
              ...c.var.commands,
            ],
          },
        })
      }

      const json = await res.json()
      if (!json.api_keys.length) return c.ok('No tokens found.')

      const lines = json.api_keys.map((key) => {
        const used = key.last_used_at
          ? (relativeTime(new Date(key.last_used_at)) ?? 'just now')
          : 'never'
        return `  ${key.name}  ${pc.dim(`${key.key_prefix}•••`)}  ${pc.dim(`used ${used}`)}`
      })
      return c.ok(lines.join('\n'))
    },
  })
  .command('delete', {
    description: 'Delete an API token',
    middleware: [requireAuth],
    args: z.object({
      name: z.string().optional().describe('Token name to delete'),
    }),
    output: z.string(),
    format: 'md',
    async run(c) {
      const listRes = await c.var.client.api.tokens.$get()
      if (listRes.status === 401) {
        Session.delete()
        return c.error({
          ...notAuthenticated,
          cta: {
            description: 'Log in:',
            commands: [
              {
                command: `${c.name} auth login`,
                description: `Authenticate with ${c.name}`,
              },
              ...c.var.commands,
            ],
          },
        })
      }

      const listJson = await listRes.json()
      if (!listJson.api_keys.length)
        return c.error({ code: 'NO_TOKENS', message: 'No tokens to delete.' })

      let match: (typeof listJson.api_keys)[number] | undefined
      if (c.args.name) {
        match = listJson.api_keys.find((k) => k.name === c.args.name)
        if (!match)
          return c.error({
            code: 'NOT_FOUND',
            message: `Token "${c.args.name}" not found.`,
          })
      } else {
        const choices = listJson.api_keys.map(
          (k) => `${k.name}  ${pc.dim(`${k.key_prefix}•••`)}`,
        )
        const index = await select('Delete token:', choices)
        if (index === -1)
          return c.error({
            code: 'INVALID_SELECTION',
            message: 'Selection cancelled.',
          })
        match = listJson.api_keys[index]
        if (!match)
          return c.error({
            code: 'INVALID_SELECTION',
            message: 'Invalid selection.',
          })
      }

      await new Promise<void>((resolve) => {
        process.stdout.write(
          `Press Enter to delete token "${match.name}" (${match.key_prefix}•••)`,
        )
        process.stdin.once('data', () => {
          process.stdin.pause()
          resolve()
        })
        process.stdin.resume()
      })

      const res = await c.var.client.api.tokens[':id'].$delete({
        param: { id: match.id },
      })

      if (res.status === 401) {
        Session.delete()
        return c.error({
          ...notAuthenticated,
          cta: {
            description: 'Log in:',
            commands: [
              {
                command: `${c.name} auth login`,
                description: `Authenticate with ${c.name}`,
              },
              ...c.var.commands,
            ],
          },
        })
      }

      if (res.status === 404)
        return c.error({
          code: 'NOT_FOUND',
          message: 'Token not found.',
        })

      return c.ok('Token deleted.')
    },
  })

const update = Cli.create('update', {
  description: 'Update curl.md CLI',
  vars,
  options: z.object({
    target: z.string().optional().describe('Update to specific version'),
  }),
  output: z.string(),
  format: 'md',
  async run(c) {
    const version = await (async () => {
      if (c.options.target) return c.options.target
      // Try curl.md API first
      try {
        const res = await c.var.client.api.cli.latest.$get(
          {
            query: {
              current: pkg.version,
              os: process.platform,
              arch: process.arch,
              standalone: String(isStandalone()),
            },
          },
          { init: { signal: AbortSignal.timeout(3_000) } },
        )
        if (res.status === 200) {
          const json = await res.json()
          if (json.version) return json.version
        }
      } catch {}
      // Fallback: npm registry
      try {
        const res = await fetch(
          `https://registry.npmjs.org/${encodeURIComponent(c.name)}/latest`,
          {
            signal: AbortSignal.timeout(5_000),
            headers: { accept: 'application/json' },
          },
        )
        if (!res.ok) return null
        const npm = (await res.json()) as { version?: string }
        return npm.version ?? null
      } catch {
        return null
      }
    })()
    if (!version)
      return c.error({
        code: 'UPDATE_FAILED',
        message: 'Could not determine latest version.',
      })
    if (
      !version.startsWith('http') &&
      compareVersions(version, pkg.version) <= 0
    )
      return c.ok(`Already up-to-date (${pkg.version}).`)
    const spinner = createSpinner(
      `Updating ${c.name} ${pkg.version} → ${version}`,
    )
    try {
      if (isStandalone()) await updateStandalone(version)
      else await installGlobal(c.name, version)
      spinner.stop()
      return c.ok(
        `Updated ${c.name}: ${pkg.version} → ${version}\nhttps://github.com/${pkg.repository}/releases/tag/${c.name}@${version}`,
      )
    } catch (error) {
      spinner.stop()
      return c.error({
        code: 'UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Update failed.',
      })
    }
  },
})

cli.command(auth)
cli.command(org)
cli.command(token)
cli.command(update)

export default cli
