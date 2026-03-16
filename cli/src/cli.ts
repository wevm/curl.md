import { hc } from 'hono/client'
import { Cli, type MiddlewareContext, middleware, z } from 'incur'
import pc from 'picocolors'
import type { api } from '../../src/api.ts'
import pkg from '../package.json' with { type: 'json' }
import { callout, confirm, formatDate, summary, table } from './ui.ts'
import {
  type Client,
  type Command,
  compareVersions,
  createSpinner,
  formatValidationError,
  installGlobal,
  isStandalone,
  openUrl,
  pollWithCancel,
  relativeTime,
  select,
  Session,
  UpdateCache,
  updateStandalone,
} from './utils.ts'

const vars = z.object({
  apiKey: z.custom<string | undefined>(),
  client: z.custom<Client>(),
  commands: z.custom<Command[]>(),
  session: z.custom<Session.Data | null>(),
})

const aliases = ['md', 'curlmd']

const cli = Cli.create('curl.md', {
  aliases,
  description: 'Fetch any URL as Markdown',
  version: pkg.version,
  env: z.object({
    CURLMD_API_KEY: z.string().optional().describe('API key for authentication'),
    CURLMD_BASE_URL: z.string().default('https://curl.md').describe('Base URL'),
  }),
  vars,
  usage: [{ suffix: '<url> [options]' }],
  args: z.object({
    url: z.string().describe('URL to fetch'),
  }),
  options: z.object({
    fresh: z.boolean().optional().describe('Force fresh fetch (bypass cache)'),
    keywords: z.array(z.string()).optional().describe('Pre-filter by keywords (comma-separated)'),
    mode: z
      .enum(['rush', 'smart'])
      .optional()
      .describe('Mode when narrowing content with --objective'),
    objective: z.string().optional().describe('Narrow content to a specific objective'),
    token: z.string().optional().describe('API token for authentication (env: CURLMD_API_KEY)'),
  }),
  alias: { fresh: 'f', keywords: 'k', mode: 'm', objective: 'o', token: 't' },
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
        mode: c.options.mode,
        q: c.options.objective,
      },
    })

    if (res.status === 401)
      return c.error({
        code: 'INVALID_API_KEY',
        message: 'Invalid API key.',
        cta: {
          description: 'Create a new token:',
          commands: [
            {
              command: `${c.name} token create <name>`,
              description: 'Create API token',
            },
            ...c.var.commands,
          ],
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
        message: 'Organization no longer accessible. Switched to account.',
        cta: {
          description: 'Switch organization:',
          commands: [
            {
              command: `${c.name} org switch`,
              description: 'Switch organization',
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
          description: c.var.session
            ? 'Add credits to remove rate limits:'
            : 'Authenticate for higher limits:',
          commands: [
            ...(c.var.session
              ? [
                  {
                    command: `${c.name} credits add`,
                    description: 'Add credits',
                  },
                ]
              : [
                  {
                    command: `${c.name} auth login`,
                    description: 'Log in for higher rate limits',
                  },
                ]),
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

    if (!c.options.objective && text.length > 10_000)
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

    if (!c.options.objective)
      return c.ok(text, {
        cta: { commands: c.var.commands },
      })

    return c.ok(text, {
      cta: { commands: c.var.commands },
    })
  },
})

cli.use(async (c, next) => {
  const session = Session.read()
  c.set('session', session)

  const apiKey = (() => {
    // TODO: add feature to incur (globalOptions)
    const i = process.argv.indexOf('--token')
    return (i !== -1 ? process.argv[i + 1] : undefined) ?? c.env.CURLMD_API_KEY
  })()
  c.set('apiKey', apiKey)

  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  else if (session) {
    headers.Authorization = `Bearer ${session.session_id}`
    if (session.organization_id) headers['x-organization-id'] = session.organization_id
  }
  c.set('client', hc<typeof api>(c.env.CURLMD_BASE_URL, { headers }))

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
  if (!c.var.session && !c.var.apiKey) return authError(c)
  return next()
})

function expiredSession(
  c: Pick<MiddlewareContext, 'error' | 'name'> & {
    var: { commands: Command[] }
  },
) {
  Session.delete()
  return authError(c)
}

function authError(
  c: Pick<MiddlewareContext, 'error' | 'name'> & {
    var: { commands: Command[] }
  },
) {
  return c.error({
    code: 'NOT_AUTHENTICATED',
    message: 'Not authenticated.',
    cta: {
      description: 'Authenticate:',
      commands: [
        {
          command: `${c.name} auth login`,
          description: 'Log in',
        },
        {
          command: `${c.name} --token <token>`,
          description: 'Use an API token instead',
        },
        ...c.var.commands,
      ],
    },
  })
}

function noActiveOrg(
  c: Pick<MiddlewareContext, 'error' | 'name'> & {
    var: { commands: Command[] }
  },
) {
  return c.error({
    code: 'NO_ACTIVE_ORG',
    message: 'No active organization.',
    cta: {
      commands: [
        {
          command: `${c.name} org switch`,
          description: 'Switch organization',
        },
        ...c.var.commands,
      ],
    },
  })
}

const auth = Cli.create('auth', {
  description: 'Authenticate with curl.md (check, login, logout)',
  vars,
})
  .command('check', {
    description: 'Check authentication status',
    middleware: [requireAuth],
    options: z.object({
      token: z.string().optional().describe('API token to check'),
    }),
    output: z.string(),
    format: 'md',
    async run(c) {
      const res = await c.var.client.api.auth.me.$get()
      const json = await res.json()
      if (!json.account) return expiredSession(c)
      const suffix = c.var.apiKey ? pc.dim(` (via token ${c.var.apiKey.slice(0, 12)}•••)`) : ''
      return c.ok(`Authenticated as ${pc.bold(json.account.login)}${suffix}`)
    },
  })
  .command('login', {
    description: 'Log in with curl.md',
    output: z.string(),
    format: 'md',
    async run(c) {
      if (c.var.session) {
        const res = await c.var.client.api.auth.me.$get()
        const json = await res.json()
        if (json.account)
          return c.error({
            code: 'ALREADY_LOGGED_IN',
            message: `Already logged in as ${pc.bold(json.account.login)}`,
          })
      }

      const deviceRes = await c.var.client.api.auth.device.$post()
      if (deviceRes.status === 429) {
        const retryAfter = deviceRes.headers.get('retry-after')
        return c.error({
          code: 'RATE_LIMITED',
          message: retryAfter
            ? `Rate limit exceeded. Try again in ${retryAfter}s.`
            : 'Rate limit exceeded. Try again later.',
        })
      }

      const device = await deviceRes.json()
      const url = `${device.verification_uri}?user_code=${device.user_code}`
      openUrl(url)

      console.log(pc.bold(`\nConfirmation Code: ${pc.green(device.user_code)}\n`))
      console.log(
        `${pc.dim('If something goes wrong, copy and paste this URL into your browser:')}\n${pc.blue(url)}\n`,
      )

      const spinner = createSpinner('Waiting for authentication')
      const abort = new AbortController()
      const onSignal = () => abort.abort()
      process.on('SIGINT', onSignal)
      process.on('SIGTERM', onSignal)
      let timedOut = false
      const timeout = setTimeout(
        () => {
          timedOut = true
          abort.abort()
        },
        5 * 60 * 1000,
      )
      const interval = (device.interval ?? 5) * 1000
      try {
        while (true) {
          if (abort.signal.aborted) {
            spinner.stop()
            return c.error(
              timedOut
                ? { code: 'TIMEOUT', message: 'Login timed out. Try again.' }
                : { code: 'CANCELED', message: 'Canceled login.' },
            )
          }
          const res = await c.var.client.api.auth.device.token.$post({
            json: { code: device.code },
          })
          if ((res.status as number) === 429) {
            const retryAfter = Number(res.headers.get('retry-after') || 5)
            await new Promise((r) => {
              const t = setTimeout(r, retryAfter * 1000)
              abort.signal.addEventListener('abort', () => {
                clearTimeout(t)
                r(undefined)
              })
            })
            continue
          }
          if (res.status !== 200) {
            const json = await res.json()
            if (json.error === 'authorization_pending') {
              await new Promise((r) => {
                const t = setTimeout(r, interval)
                abort.signal.addEventListener('abort', () => {
                  clearTimeout(t)
                  r(undefined)
                })
              })
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
          const meRes = await c.var.client.api.auth.me.$get(
            {},
            {
              headers: { Authorization: `Bearer ${json.session_id}` },
            },
          )
          const me = await meRes.json()
          const login = me.account?.login
          return c.ok(`Logged in${login ? ` as ${pc.bold(login)}` : ''}`)
        }
      } catch (error) {
        spinner.stop()
        throw error
      } finally {
        clearTimeout(timeout)
        process.off('SIGINT', onSignal)
        process.off('SIGTERM', onSignal)
      }
    },
  })
  .command('logout', {
    description: 'Log out of the curl.md CLI',
    output: z.string(),
    format: 'md',
    async run(c) {
      if (!c.var.session) return c.ok('Already logged out.')
      Session.delete()
      return c.ok('Logged out.')
    },
  })

const credits = Cli.create('credits', {
  description: 'Manage prepaid credits (add, check)',
  vars,
})
  .command('add', {
    description: 'Add credits',
    middleware: [requireAuth],
    args: z.object({
      amount: z.enum(['5', '10', '20', '50']).default('10').describe('Amount in dollars'),
    }),
    output: z.string(),
    format: 'md',
    async run(c) {
      // Check for saved payment method
      const creditsRes = await c.var.client.api.credits.$get()
      if (creditsRes.status === 401) return expiredSession(c)
      if (creditsRes.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: 'Must be owner or admin to add credits.',
        })
      if (creditsRes.status !== 200)
        return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

      const commands = [
        {
          command: `${c.name} credits check`,
          description: 'Check balance',
        },
        ...c.var.commands,
      ]

      const credits = await creditsRes.json()
      // If saved card exists, prompt and charge
      let selectedAmount = c.args.amount
      if (credits.payment_method) {
        while (true) {
          const choice = await select(`Charge $${selectedAmount} to:`, [
            `${credits.payment_method.brand.charAt(0).toUpperCase() + credits.payment_method.brand.slice(1)} •••• ${credits.payment_method.last4}`,
            'Select different amount',
            'Add new payment method',
          ])

          if (choice === -1) return c.ok('Cancelled.')
          if (choice === 2) break // falls through to browser flow

          if (choice === 1) {
            const values = ['5', '10', '20', '50'] as const
            const maxLen = `$${values[values.length - 1]}`.length
            const amountChoice = await select(
              'Amount:',
              values.map(
                (v) =>
                  `$${v}`.padEnd(maxLen + 1) +
                  pc.dim(`(~${(Number(v) * 1000).toLocaleString()} requests)`),
              ),
              { doneLabels: values.map((v) => `$${v}`) },
            )
            if (amountChoice === -1) return c.ok('Cancelled.')
            selectedAmount = values[amountChoice]
            continue
          }

          const spinner = createSpinner('Adding credits')
          const chargeRes = await c.var.client.api.credits.charge.$post({
            json: {
              amount: `${Number(selectedAmount) * 100}` as '500' | '1000' | '2000' | '5000',
              organization_id: c.var.session?.organization_id,
            },
          })

          if (chargeRes.status === 401) {
            spinner.stop()
            return expiredSession(c)
          }
          if (chargeRes.status !== 200) {
            spinner.stop()
            return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })
          }

          const chargeJson = await chargeRes.json()
          switch (chargeJson.status) {
            case 'succeeded': {
              const result = await pollWithCancel(c.var.client, credits.balance_mills, spinner)
              if (!result)
                return c.error({
                  code: 'CANCELED',
                  message: 'Canceled adding credits.',
                })
              return c.ok(result, { cta: { commands } })
            }
            case 'requires_action': {
              spinner.stop()
              const url = chargeJson.url
              openUrl(url)
              console.log(
                `\n${pc.dim('If something goes wrong, copy and paste this URL into your browser:')}\n${pc.blue(url)}\n`,
              )
              const result = await pollWithCancel(
                c.var.client,
                credits.balance_mills,
                'Waiting for payment',
              )
              if (!result)
                return c.error({
                  code: 'CANCELED',
                  message: 'Canceled adding credits.',
                })
              return c.ok(result, { cta: { commands } })
            }
          }
        }
      }

      // No saved card or user chose "Add new" — browser flow
      const addRes = await c.var.client.api.credits.add.$post({
        json: {
          amount: `${Number(selectedAmount) * 100}` as '500' | '1000' | '2000' | '5000',
          organization_id: c.var.session?.organization_id,
        },
      })

      if (addRes.status === 401) return expiredSession(c)
      if (addRes.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: 'Must be owner or admin to add credits.',
        })
      if (addRes.status !== 200) return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

      const addJson = await addRes.json()
      openUrl(addJson.url)
      console.log(
        `\n${pc.dim('If something goes wrong, copy and paste this URL into your browser:')}\n${pc.blue(addJson.url)}\n`,
      )

      const result = await pollWithCancel(
        c.var.client,
        credits.balance_mills,
        'Waiting for payment',
      )
      if (!result)
        return c.error({
          code: 'CANCELED',
          message: 'Canceled adding credits.',
        })
      return c.ok(result, { cta: { commands } })
    },
  })
  .command('check', {
    description: 'Check balance',
    middleware: [requireAuth],
    output: z.string(),
    format: 'md',
    async run(c) {
      const res = await c.var.client.api.credits.$get()
      if (res.status === 401) return expiredSession(c)
      if (res.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: 'Must be owner or admin to check credits.',
        })
      if (res.status !== 200) return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

      const json = await res.json()
      const dollars = (json.balance_mills / 1_000).toFixed(3)
      const requests = json.balance_mills.toLocaleString()
      return c.ok(`${pc.bold(`$${dollars}`)} ${pc.dim(`(~${requests} requests)`)}`, {
        cta: {
          commands: [
            {
              command: `${c.name} credits add`,
              description: 'Add credits',
            },
            ...c.var.commands,
          ],
        },
      })
    },
  })

const invite = Cli.create('invite', {
  description: 'Manage organization invites (accept, create, list, revoke)',
  vars,
})
  .command('accept', {
    description: 'Accept organization invite',
    middleware: [requireAuth],
    args: z.object({
      token: z.string().describe('Invite URL or token'),
    }),
    output: z.string(),
    format: 'md',
    async run(c) {
      const inviteToken = (() => {
        if (c.args.token.includes('/invite/'))
          return c.args.token.split('/invite/').pop() ?? c.args.token
        return c.args.token
      })()

      const res = await c.var.client.api.invites[':token'].accept.$post({
        param: { token: inviteToken },
      })
      if (res.status === 401) return expiredSession(c)
      if (res.status === 404)
        return c.error({
          code: 'NOT_FOUND',
          message: 'Invite not found, expired, or fully used.',
        })
      if (res.status === 409)
        return c.error({
          code: 'ALREADY_MEMBER',
          message: 'Already a member.',
        })
      if (res.status !== 200) return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

      const json = await res.json()
      return c.ok(`Joined ${pc.bold(json.organization.login)}.`, {
        cta: {
          commands: [
            {
              command: `${c.name} org switch ${json.organization.login}`,
              description: `Switch to ${json.organization.login}`,
            },
            ...c.var.commands,
          ],
        },
      })
    },
  })
  .command('create', {
    description: 'Create organization invite link',
    middleware: [requireAuth],
    options: z.object({
      'expires-in': z.number().default(604_800).describe('Expiry in seconds'),
      'max-uses': z.number().optional().describe('Maximum number of uses'),
      role: z.enum(['member', 'admin']).default('member').describe('Role for invited members'),
    }),
    alias: { 'expires-in': 'e', 'max-uses': 'm', role: 'r' },
    output: z.string(),
    format: 'md',
    async run(c) {
      const orgId = c.var.session?.organization_id
      if (!orgId) return noActiveOrg(c)

      const res = await c.var.client.api.orgs[':id'].invites.$post({
        param: { id: orgId },
        json: {
          role: c.options.role,
          max_uses: c.options['max-uses'],
          expires_in: c.options['expires-in'],
        },
      })
      if (res.status === 401) return expiredSession(c)
      if (res.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: 'No permission to create invites.',
        })
      if (res.status !== 201) return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

      const json = await res.json()
      const inv = json.invite
      const uses = inv.max_uses ? `0/${inv.max_uses}` : '0/∞'
      return c.ok(
        summary(
          [
            ['url', pc.bold(inv.url)],
            ['role', inv.role],
            ['uses', uses],
            ['expires', formatDate(new Date(inv.expires_at))],
          ],
          'Invite created',
        ) +
          '\n\n' +
          callout('Share this link to invite members.'),
      )
    },
  })
  .command('list', {
    description: 'List organization invites',
    middleware: [requireAuth],
    output: z.string(),
    format: 'md',
    async run(c) {
      const orgId = c.var.session?.organization_id
      if (!orgId) return noActiveOrg(c)

      const res = await c.var.client.api.orgs[':id'].invites.$get({
        param: { id: orgId },
      })
      if (res.status === 401) return expiredSession(c)
      if (res.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: 'No permission to view invites.',
        })

      const json = await res.json()
      if (!json.invites.length)
        return c.ok('No invites found.', {
          cta: {
            commands: [
              {
                command: `${c.name} org invite create`,
                description: 'Create invite link',
              },
              ...c.var.commands,
            ],
          },
        })

      const rows = json.invites.map((inv) => {
        const expiresAt = new Date(inv.expires_at)
        const expired = expiresAt < new Date()
        const months = [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ]
        const dateStr = `${months[expiresAt.getMonth()]} ${expiresAt.getDate()} ${expiresAt.getFullYear()}`
        const expiryCol = expired ? `expired ${pc.dim(`(${dateStr})`)}` : formatDate(expiresAt)
        return [
          inv.token,
          inv.role,
          inv.max_uses ? `${inv.use_count}/${inv.max_uses}` : `${inv.use_count}/∞`,
          expiryCol,
          formatDate(new Date(inv.created_at)),
        ]
      })
      return c.ok(table(['token', 'role', 'uses', 'expires', 'created'], rows))
    },
  })
  .command('revoke', {
    description: 'Revoke organization invite',
    middleware: [requireAuth],
    args: z.object({
      invite: z.string().optional().describe('Invite token or ID to revoke'),
    }),
    options: z.object({
      force: z.boolean().optional().describe('Skip confirmation'),
    }),
    alias: { force: 'f' },
    output: z.string(),
    format: 'md',
    async run(c) {
      const orgId = c.var.session?.organization_id
      if (!orgId) return noActiveOrg(c)

      let inviteId = c.args.invite
      if (inviteId) {
        if (!c.options.force) {
          if (!process.stdin.isTTY)
            return c.error({
              code: 'CONFIRM_REQUIRED',
              message: 'Destructive action requires --force when not interactive.',
              cta: {
                commands: [
                  {
                    command: `${c.name} invite revoke ${inviteId} --force`,
                    description: 'Force revoke',
                  },
                  ...c.var.commands,
                ],
              },
            })
          const yes = await confirm(`Revoke invite "${inviteId}"?`)
          if (!yes) return c.ok('Cancelled.')
        }
      } else {
        if (!process.stdin.isTTY)
          return c.error({
            code: 'NO_INPUT',
            message: 'Pass invite token directly in non-interactive mode.',
            cta: {
              commands: [
                { command: `${c.name} invite revoke <invite>`, description: 'Revoke by token' },
                ...c.var.commands,
              ],
            },
          })
        const listRes = await c.var.client.api.orgs[':id'].invites.$get({
          param: { id: orgId },
        })
        if (listRes.status === 401) return expiredSession(c)

        if (listRes.status !== 200)
          return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })
        const listJson = await listRes.json()
        if (!listJson.invites.length)
          return c.error({
            code: 'NO_INVITES',
            message: 'No invites to revoke.',
          })

        const maxToken = Math.max(...listJson.invites.map((inv) => inv.token.length))
        const choices = listJson.invites.map((inv) => {
          const expiresAt = new Date(inv.expires_at)
          const expired = expiresAt < new Date()
          const uses = inv.max_uses ? `${inv.use_count}/${inv.max_uses}` : `${inv.use_count}/∞`
          const expiry = expired ? 'expired' : formatDate(expiresAt)
          return `${inv.token.padEnd(maxToken)}   ${inv.role}   ${uses}   ${expiry}`
        })
        const index = await select('Revoke invite:', choices)
        if (index === -1) return c.ok('Cancelled.')
        const selected = listJson.invites[index]
        if (!selected)
          return c.error({
            code: 'INVALID_SELECTION',
            message: 'Invalid selection.',
          })
        inviteId = selected.id
      }
      if (!inviteId)
        return c.error({
          code: 'INVALID_SELECTION',
          message: 'Invalid selection.',
        })

      const res = await c.var.client.api.orgs[':id'].invites[':inviteId'].$delete({
        param: { id: orgId, inviteId },
      })

      if (res.status === 401) return expiredSession(c)

      if (res.status === 404) return c.error({ code: 'NOT_FOUND', message: 'Invite not found.' })

      return c.ok('Invite revoked.')
    },
  })

const member = Cli.create('member', {
  description: 'Manage organization members (add, list, remove, role)',
  vars,
})
  .command('add', {
    description: 'Add a member to the active organization',
    middleware: [requireAuth],
    args: z.object({
      login: z.string().describe('Account login to add'),
    }),
    options: z.object({
      role: z.enum(['member', 'admin']).default('member').describe('Role for the new member'),
    }),
    alias: { role: 'r' },
    output: z.string(),
    format: 'md',
    async run(c) {
      const orgId = c.var.session?.organization_id
      if (!orgId) return noActiveOrg(c)

      const res = await c.var.client.api.orgs[':id'].members.$post({
        param: { id: orgId },
        json: { login: c.args.login, role: c.options.role },
      })

      if (res.status === 401) return expiredSession(c)

      if (res.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: 'No permission to add members.',
        })

      if (res.status === 404) return c.error({ code: 'NOT_FOUND', message: 'Account not found.' })

      if (res.status === 409)
        return c.error({
          code: 'ALREADY_MEMBER',
          message: 'Already a member.',
        })

      if (res.status !== 201) return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

      return c.ok(`Added ${c.args.login} as ${c.options.role}.`)
    },
  })
  .command('list', {
    description: 'List members of the active organization',
    middleware: [requireAuth],
    output: z.string(),
    format: 'md',
    async run(c) {
      const orgId = c.var.session?.organization_id
      if (!orgId) return noActiveOrg(c)

      const res = await c.var.client.api.orgs[':id'].members.$get({
        param: { id: orgId },
      })

      if (res.status === 401) return expiredSession(c)

      if (res.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: 'No permission to view members.',
        })

      const json = await res.json()
      if (!json.members.length)
        return c.ok('No members found.', {
          cta: {
            commands: [
              {
                command: `${c.name} org member add <login>`,
                description: 'Add member',
              },
              ...c.var.commands,
            ],
          },
        })

      const rows = json.members.map((m) => [m.login, m.role, formatDate(new Date(m.created_at))])
      return c.ok(table(['login', 'role', 'joined'], rows))
    },
  })
  .command('remove', {
    description: 'Remove a member from the active organization',
    middleware: [requireAuth],
    args: z.object({
      login: z.string().optional().describe('Member login to remove'),
    }),
    options: z.object({
      force: z.boolean().optional().describe('Skip confirmation'),
    }),
    alias: { force: 'f' },
    output: z.string(),
    format: 'md',
    async run(c) {
      const orgId = c.var.session?.organization_id
      if (!orgId) return noActiveOrg(c)

      const listRes = await c.var.client.api.orgs[':id'].members.$get({
        param: { id: orgId },
      })
      if (listRes.status === 401) return expiredSession(c)

      if (listRes.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: 'No permission to remove members.',
        })
      if (listRes.status !== 200) return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })
      const listJson = await listRes.json()
      if (!listJson.members.length)
        return c.error({
          code: 'NO_MEMBERS',
          message: 'No members to remove.',
        })

      let login = c.args.login
      if (c.args.login) {
        const match = listJson.members.find((m) => m.login === c.args.login)
        if (!match)
          return c.error({
            code: 'NOT_FOUND',
            message: `Member "${c.args.login}" not found.`,
          })
        login = match.login
        if (!c.options.force) {
          if (!process.stdin.isTTY)
            return c.error({
              code: 'CONFIRM_REQUIRED',
              message: 'Destructive action requires --force when not interactive.',
              cta: {
                commands: [
                  {
                    command: `${c.name} member remove ${login} --force`,
                    description: 'Force remove',
                  },
                  ...c.var.commands,
                ],
              },
            })
          const yes = await confirm(`Remove ${login} from organization?`)
          if (!yes) return c.ok('Cancelled.')
        }
      } else {
        if (!process.stdin.isTTY)
          return c.error({
            code: 'NO_INPUT',
            message: 'Pass member login directly in non-interactive mode.',
            cta: {
              commands: [
                { command: `${c.name} member remove <login>`, description: 'Remove by login' },
                ...c.var.commands,
              ],
            },
          })
        const choices = listJson.members.map((m) => `${m.login}  ${pc.dim(m.role)}`)
        const index = await select('Remove member:', choices)
        if (index === -1) return c.ok('Cancelled.')
        const selected = listJson.members[index]
        if (!selected)
          return c.error({
            code: 'INVALID_SELECTION',
            message: 'Invalid selection.',
          })
        login = selected.login
      }

      const match = listJson.members.find((m) => m.login === login)
      if (!match)
        return c.error({
          code: 'NOT_FOUND',
          message: `Member "${login}" not found.`,
        })

      const res = await c.var.client.api.orgs[':id'].members[':memberId'].$delete({
        param: { id: orgId, memberId: match.id },
      })

      if (res.status === 401) return expiredSession(c)

      if (res.status === 403) {
        const json = await res.json()
        const message = (() => {
          if (json.error === 'cannot_remove_self') return 'Cannot remove yourself.'
          if (json.error === 'cannot_remove_owner') return 'Cannot remove an owner.'
          return 'No permission to remove members.'
        })()
        return c.error({ code: 'FORBIDDEN', message })
      }

      if (res.status === 404) return c.error({ code: 'NOT_FOUND', message: 'Member not found.' })

      return c.ok(`Removed ${login} from organization.`)
    },
  })
  .command('role', {
    description: 'Change member role',
    middleware: [requireAuth],
    args: z.object({
      login: z.string().optional().describe('Member login to change role for'),
    }),
    options: z.object({
      force: z.boolean().optional().describe('Skip confirmation'),
      role: z.enum(['member', 'admin']).optional().describe('New role'),
    }),
    alias: { force: 'f', role: 'r' },
    output: z.string(),
    format: 'md',
    async run(c) {
      const orgId = c.var.session?.organization_id
      if (!orgId) return noActiveOrg(c)

      const listRes = await c.var.client.api.orgs[':id'].members.$get({
        param: { id: orgId },
      })
      if (listRes.status === 401) return expiredSession(c)

      if (listRes.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: 'No permission to change roles.',
        })
      if (listRes.status !== 200) return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })
      const listJson = await listRes.json()
      if (!listJson.members.length)
        return c.error({
          code: 'NO_MEMBERS',
          message: 'No members found.',
        })

      let login = c.args.login
      if (c.args.login) {
        const match = listJson.members.find((m) => m.login === c.args.login)
        if (!match)
          return c.error({
            code: 'NOT_FOUND',
            message: `Member "${c.args.login}" not found.`,
          })
        login = match.login
      } else {
        if (!process.stdin.isTTY)
          return c.error({
            code: 'NO_INPUT',
            message: 'Pass member login directly in non-interactive mode.',
            cta: {
              commands: [
                {
                  command: `${c.name} member role <login> --role <role>`,
                  description: 'Change role',
                },
                ...c.var.commands,
              ],
            },
          })
        const choices = listJson.members.map((m) => `${m.login}  ${pc.dim(m.role)}`)
        const index = await select('Change role for:', choices)
        if (index === -1) return c.ok('Cancelled.')
        const selected = listJson.members[index]
        if (!selected)
          return c.error({
            code: 'INVALID_SELECTION',
            message: 'Invalid selection.',
          })
        login = selected.login
      }

      const match = listJson.members.find((m) => m.login === login)
      if (!match)
        return c.error({
          code: 'NOT_FOUND',
          message: `Member "${login}" not found.`,
        })

      let role = c.options.role
      if (!role) {
        const roles = ['member', 'admin'] as const
        const roleChoices = roles.map((r) => (r === match.role ? `${r} ${pc.dim('(current)')}` : r))
        const roleIndex = await select('New role:', roleChoices, { doneLabels: [...roles] })
        if (roleIndex === -1)
          return c.error({
            code: 'INVALID_SELECTION',
            message: 'Selection cancelled.',
          })
        role = roles[roleIndex]
        if (!role)
          return c.error({
            code: 'INVALID_SELECTION',
            message: 'Invalid selection.',
          })
      }

      if (role === match.role) return c.ok('Role unchanged.')

      if (c.args.login && c.options.role && !c.options.force) {
        if (!process.stdin.isTTY)
          return c.error({
            code: 'CONFIRM_REQUIRED',
            message: 'Destructive action requires --force when not interactive.',
            cta: {
              commands: [
                {
                  command: `${c.name} member role ${login} --role ${role} --force`,
                  description: 'Force role change',
                },
                ...c.var.commands,
              ],
            },
          })
        const yes = await confirm(`Change ${login} role to ${role}?`)
        if (!yes) return c.ok('Cancelled.')
      }

      const res = await c.var.client.api.orgs[':id'].members[':memberId'].$patch({
        param: { id: orgId, memberId: match.id },
        json: { role },
      })

      if (res.status === 401) return expiredSession(c)

      if (res.status === 403) {
        const json = await res.json()
        const message =
          json.error === 'cannot_change_owner'
            ? 'Cannot change owner role.'
            : 'No permission to change roles.'
        return c.error({ code: 'FORBIDDEN', message })
      }

      if (res.status === 404) return c.error({ code: 'NOT_FOUND', message: 'Member not found.' })

      return c.ok(`Changed ${login} role to ${role}.`)
    },
  })

const org = Cli.create('org', {
  description: 'Manage organizations (create, invite, list, members, show, switch)',
  vars,
})
  .command('create', {
    description: 'Create organization',
    middleware: [requireAuth],
    args: z.object({
      login: z.string().describe('Organization login (e.g. "wevm")'),
    }),
    options: z.object({
      name: z.string().optional().describe('Display name'),
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
      if (res.status === 401) return expiredSession(c)

      if (res.status === 409) {
        const json = await res.json()
        return c.error({ code: 'CREATE_FAILED', message: json.error })
      }

      const json = await res.json()
      return c.ok(`Created organization ${pc.bold(json.login)}`, {
        cta: {
          commands: [
            {
              command: `${c.name} org switch ${json.login}`,
              description: `Switch to organization`,
            },
            {
              command: `${c.name} org invite create <login>`,
              description: 'Create organization invite link',
            },
            {
              command: `${c.name} org member add <login>`,
              description: 'Add organization member directly',
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
      if (res.status === 401) return expiredSession(c)

      const json = await res.json()
      let activeId = c.var.session?.organization_id

      if (activeId && !json.organizations.some((org) => org.id === activeId)) {
        Session.write({ organization_id: undefined })
        activeId = undefined
      }

      if (!json.organizations.length)
        return c.ok('No organizations.', {
          cta: {
            commands: [
              {
                command: `${c.name} org create <login>`,
                description: 'Create organization',
              },
              ...c.var.commands,
            ],
          },
        })

      const rows = json.organizations.map((org) => [
        org.id === activeId ? `${org.login}${pc.green('*')}` : org.login,
        org.name,
      ])
      return c.ok(table(['login', 'name'], rows))
    },
  })
  .command('show', {
    description: 'Show active organization',
    middleware: [requireAuth],
    output: z.string(),
    format: 'md',
    async run(c) {
      if (!c.var.session?.organization_id) {
        const orgsRes = await c.var.client.api.orgs.$get()
        if (orgsRes.status === 401) return expiredSession(c)
        const orgsJson = await orgsRes.json()
        const hasOrgs = orgsJson.organizations.length > 0
        return c.ok('No active organization.', {
          cta: {
            commands: [
              hasOrgs
                ? {
                    command: `${c.name} org switch`,
                    description: 'Switch organization',
                  }
                : {
                    command: `${c.name} org create <login>`,
                    description: 'Create organization',
                  },
              ...c.var.commands,
            ],
          },
        })
      }

      const res = await c.var.client.api.orgs[':id'].$get({
        param: { id: c.var.session.organization_id },
      })
      if (res.status === 401) return expiredSession(c)
      if (res.status === 404) {
        Session.write({ organization_id: undefined })
        return c.ok('Organization no longer accessible. Switched to account.')
      }

      const json = await res.json()
      return c.ok(`${pc.bold(json.organization.login)} ${pc.dim(`(${json.organization.name})`)}`)
    },
  })
  .command('switch', {
    description: 'Switch organization',
    middleware: [requireAuth],
    args: z.object({
      login: z.string().optional().describe('Organization login to switch to (or "account")'),
    }),
    output: z.string(),
    format: 'md',
    async run(c) {
      const [orgsRes, meRes] = await Promise.all([
        c.var.client.api.orgs.$get(),
        c.var.client.api.auth.me.$get(),
      ])
      if (orgsRes.status === 401) return expiredSession(c)

      const orgsJson = await orgsRes.json()
      const meJson = await meRes.json()
      const accountLogin = meJson.account?.login ?? 'account'

      if (c.args.login) {
        if (c.args.login === accountLogin || c.args.login === 'account') {
          Session.write({ organization_id: undefined })
          return c.ok(`Switched to ${pc.bold(accountLogin)} ${pc.dim('(account)')}`)
        }
        const match = orgsJson.organizations.find((o) => o.login === c.args.login)
        if (!match)
          return c.error({
            code: 'ORG_NOT_FOUND',
            message: `Organization "${c.args.login}" not found.`,
          })
        Session.write({ organization_id: match.id })
        return c.ok(`Switched to ${pc.bold(match.login)}`)
      }

      const choices = [
        ...orgsJson.organizations.map((o) => ({
          label: o.login,
          id: o.id,
        })),
        {
          label: `${accountLogin} ${pc.dim('(account)')}`,
          id: undefined as string | undefined,
        },
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
      return c.ok(`Switched to ${pc.bold(selected.label)}`)
    },
  })

const token = Cli.create('token', {
  description: 'Manage API tokens (create, list, delete)',
  vars,
})
  .command('create', {
    description: 'Create API token',
    middleware: [requireAuth],
    args: z.object({
      name: z.string().describe('Token name'),
    }),
    output: z.string(),
    format: 'md',
    async run(c) {
      const res = await c.var.client.api.tokens.$post({
        json: { name: c.args.name },
      })
      if (res.status === 401) return expiredSession(c)
      if (res.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: 'Cannot create tokens with API token.',
        })
      if (res.status === 409)
        return c.error({
          code: 'NAME_TAKEN',
          message: `Token ${pc.bold(c.args.name)} already exists.`,
        })
      if (res.status !== 201) return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

      const json = await res.json()
      return c.ok(
        summary(
          [
            ['name', json.api_key.name],
            ['token', pc.green(pc.bold(json.api_key.token))],
          ],
          'Token created',
        ) +
          '\n\n' +
          callout("Save this token. It won't be shown again."),
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
      if (res.status === 401) return expiredSession(c)

      const json = await res.json()
      if (!json.api_keys.length)
        return c.ok('No tokens found.', {
          cta: {
            commands: [
              {
                command: `${c.name} token create <name>`,
                description: 'Create API token',
              },
              ...c.var.commands,
            ],
          },
        })

      json.api_keys.sort((a, b) => {
        if (!a.last_used_at && !b.last_used_at) return 0
        if (!a.last_used_at) return 1
        if (!b.last_used_at) return -1
        return new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime()
      })
      const rows = json.api_keys.map((key) => [
        key.name,
        pc.dim(`${key.key_prefix}•••`),
        key.last_used_at ? formatDate(new Date(key.last_used_at)) : 'never',
        formatDate(new Date(key.created_at)),
      ])
      return c.ok(table(['name', 'key', 'used', 'created'], rows))
    },
  })
  .command('delete', {
    description: 'Delete API token',
    middleware: [requireAuth],
    args: z.object({
      name: z.string().optional().describe('Token name to delete'),
    }),
    options: z.object({
      force: z.boolean().optional().describe('Skip confirmation'),
    }),
    alias: { force: 'f' },
    output: z.string(),
    format: 'md',
    async run(c) {
      const listRes = await c.var.client.api.tokens.$get()
      if (listRes.status === 401) return expiredSession(c)

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
        if (!c.options.force) {
          if (!process.stdin.isTTY)
            return c.error({
              code: 'CONFIRM_REQUIRED',
              message: 'Destructive action requires --force when not interactive.',
              cta: {
                commands: [
                  {
                    command: `${c.name} token delete ${match.name} --force`,
                    description: 'Force delete',
                  },
                  ...c.var.commands,
                ],
              },
            })
          const yes = await confirm(`Delete token "${match.name}"?`)
          if (!yes) return c.ok('Cancelled.')
        }
      } else {
        if (!process.stdin.isTTY)
          return c.error({
            code: 'NO_INPUT',
            message: 'Pass token name directly in non-interactive mode.',
            cta: {
              commands: [
                { command: `${c.name} token delete <name>`, description: 'Delete by name' },
                ...c.var.commands,
              ],
            },
          })
        listJson.api_keys.sort((a, b) => {
          if (!a.last_used_at && !b.last_used_at) return 0
          if (!a.last_used_at) return -1
          if (!b.last_used_at) return 1
          return new Date(a.last_used_at).getTime() - new Date(b.last_used_at).getTime()
        })
        const maxName = Math.max(...listJson.api_keys.map((k) => k.name.length))
        const choices = listJson.api_keys.map((k) => {
          const used = k.last_used_at ? formatDate(new Date(k.last_used_at)) : 'never'
          const name = k.name.padEnd(maxName)
          return `${name}   ${pc.dim(`${k.key_prefix}•••`)}   ${used}`
        })
        const doneLabels = listJson.api_keys.map((k) => k.name)
        const index = await select('Delete token:', choices, { doneLabels })
        if (index === -1) return c.ok('Cancelled.')
        match = listJson.api_keys[index]
        if (!match)
          return c.error({
            code: 'INVALID_SELECTION',
            message: 'Invalid selection.',
          })
      }

      const res = await c.var.client.api.tokens[':id'].$delete({
        param: { id: match.id },
      })
      if (res.status === 401) return expiredSession(c)
      if (res.status === 404) return c.error({ code: 'NOT_FOUND', message: 'Token not found.' })

      return c.ok(`Token ${pc.bold(match.name)} deleted.`)
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
        const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(c.name)}/latest`, {
          signal: AbortSignal.timeout(5_000),
          headers: { accept: 'application/json' },
        })
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
    if (!version.startsWith('http') && compareVersions(version, pkg.version) <= 0)
      return c.ok(`Already up-to-date (${pkg.version}).`)
    const spinner = createSpinner(`Updating ${c.name} ${pkg.version} → ${version}`)
    try {
      if (isStandalone()) await updateStandalone(version, aliases)
      else await installGlobal(c.name, version)
      spinner.stop()
      return c.ok(
        `Updated ${c.name}: ${pkg.version} → ${version}\nhttps://github.com/wevm/curl.md/releases/tag/${c.name}@${version}`,
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
cli.command(credits)
cli.command(org.command(invite).command(member))
cli.command(token)
cli.command(update)

export default cli
