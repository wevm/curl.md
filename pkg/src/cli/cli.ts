import { hc } from 'hono/client'
import { Cli, middleware, z } from 'incur'
import pc from 'picocolors'
import type { api } from '../../../src/api.ts'
import pkg from '../../package.json' with { type: 'json' }
import {
  type Client,
  type Command,
  compareVersions,
  createSpinner,
  formatValidationError,
  installGlobal,
  isStandalone,
  openUrl,
  pollForBalance,
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

const aliases = ['md', 'curlmd']

const cli = Cli.create('curl.md', {
  aliases,
  description: 'Fetch any URL as Markdown',
  version: pkg.version,
  env: z.object({
    CURLMD_API_KEY: z
      .string()
      .optional()
      .describe('API key for authentication'),
    CURLMD_BASE_URL: z.string().default('https://curl.md').describe('Base URL'),
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
    mode: z
      .enum(['rush', 'smart'])
      .optional()
      .describe('Mode when narrowing content with --objective'),
    objective: z
      .string()
      .optional()
      .describe('Narrow content to a specific objective'),
    'api-key': z
      .string()
      .optional()
      .describe('API key for authentication (overrides CURLMD_API_KEY)'),
  }),
  alias: { fresh: 'f', keywords: 'k', mode: 'm', objective: 'o' },
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
              description: 'Create a new API token',
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
          description: c.var.session
            ? 'Add credits to remove rate limits:'
            : 'Authenticate for higher limits:',
          commands: [
            ...(c.var.session
              ? [
                  {
                    command: `${c.name} credits add`,
                    description: 'Add credits to your balance',
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
  const headers: Record<string, string> = {}
  // TODO: add feature to incur
  const keyIndex = process.argv.indexOf('--api-key')
  const apiKey =
    (keyIndex !== -1 ? process.argv[keyIndex + 1] : undefined) ??
    c.env.CURLMD_API_KEY
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  } else if (session) {
    headers.Authorization = `Bearer ${session.session_id}`
    if (session.organization_id)
      headers['x-organization-id'] = session.organization_id
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

function expiredSession(c: {
  error: (options: {
    code: string
    cta?: { description: string; commands: Command[] }
    message: string
  }) => never
  name: string
  var: { commands: Command[] }
}) {
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

const auth = Cli.create('auth', {
  description: 'Authentication commands (check, login, logout)',
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
      if (!json.account) return expiredSession(c)
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
      if ((deviceRes.status as number) === 429) {
        const retryAfter = deviceRes.headers.get('retry-after')
        return c.error({
          code: 'RATE_LIMITED',
          message: retryAfter
            ? `Rate limit exceeded. Try again in ${retryAfter}s.`
            : 'Rate limit exceeded. Try again later.',
        })
      }
      if (deviceRes.status !== 200) {
        const json = await deviceRes.json()
        return c.error({ code: 'AUTH_FAILED', message: json.error })
      }
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
          if ((res.status as number) === 429) {
            const retryAfter = res.headers.get('retry-after')
            spinner.stop()
            return c.error({
              code: 'RATE_LIMITED',
              message: retryAfter
                ? `Rate limit exceeded. Try again in ${retryAfter}s.`
                : 'Rate limit exceeded. Try again later.',
            })
          }
          if (res.status !== 200) {
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

const credits = Cli.create('credits', {
  description: 'Manage prepaid credits (add, check)',
  vars,
})
  .command('add', {
    description: 'Add credits to your balance',
    middleware: [requireAuth],
    args: z.object({
      amount: z
        .enum(['500', '1000', '2000', '5000'])
        .default('1000')
        .describe(
          'Amount in cents: 500 ($5), 1000 ($10), 2000 ($20), 5000 ($50)',
        ),
    }),
    output: z.string(),
    format: 'md',
    async run(c) {
      // Check for saved payment method
      const creditsRes = await c.var.client.api.credits.$get()
      if (creditsRes.status === 401) return expiredSession(c)
      if (creditsRes.status !== 200)
        return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

      const credits = await creditsRes.json()
      // If saved card exists, prompt and charge
      let selectedAmount = c.args.amount
      if (credits.payment_method) {
        while (true) {
          const dollars = (Number(selectedAmount) / 100).toFixed(2)
          const choice = await select(`Charge $${dollars} to:`, [
            `${credits.payment_method.brand} ending in ${credits.payment_method.last4}`,
            'Change amount',
            'Add new payment method',
          ])

          if (choice === -1) return c.ok('Cancelled.')
          if (choice === 2) break // falls through to browser flow

          if (choice === 1) {
            const amounts = ['$5', '$10', '$20', '$50'] as const
            const amountChoice = await select('Amount:', [...amounts])
            if (amountChoice === -1) return c.ok('Cancelled.')
            selectedAmount = (['500', '1000', '2000', '5000'] as const)[
              amountChoice
            ]
            continue
          }

          const chargeRes = await c.var.client.api.credits.charge.$post({
            json: {
              amount: selectedAmount,
              organization_id: c.var.session?.organization_id,
            },
          })

          if (chargeRes.status === 401) return expiredSession(c)
          if (chargeRes.status !== 200)
            return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

          const chargeJson = await chargeRes.json()

          if ('error' in chargeJson) {
            const msg =
              typeof chargeJson.error === 'string'
                ? chargeJson.error
                : 'Payment failed.'
            return c.error({ code: 'PAYMENT_FAILED', message: msg })
          }

          if (chargeJson.status === 'succeeded') {
            const spinner = createSpinner('Waiting for balance update...')
            try {
              return c.ok(
                await pollForBalance(
                  c.var.client,
                  credits.balance_mills,
                  spinner,
                ),
              )
            } catch (error) {
              spinner.stop()
              throw error
            }
          }

          if (chargeJson.status === 'requires_action' && 'url' in chargeJson) {
            const url = chargeJson.url as string
            openUrl(url)
            console.log(
              `\nIf something goes wrong, copy and paste this URL into your browser:\n${pc.bold(url)}\n`,
            )
            const spinner = createSpinner('Waiting for payment...')
            try {
              return c.ok(
                await pollForBalance(
                  c.var.client,
                  credits.balance_mills,
                  spinner,
                ),
              )
            } catch (error) {
              spinner.stop()
              throw error
            }
          }
        }
      }

      // No saved card or user chose "Add new" — browser flow
      const addRes = await c.var.client.api.credits.add.$post({
        json: {
          amount: selectedAmount,
          organization_id: c.var.session?.organization_id,
        },
      })

      if (addRes.status === 401) return expiredSession(c)
      if (addRes.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message:
            'You must be an owner or admin to add credits to this organization.',
        })
      if (addRes.status !== 200)
        return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

      const addJson = await addRes.json()
      openUrl(addJson.url)
      console.log(
        `\nIf something goes wrong, copy and paste this URL into your browser:\n${pc.bold(addJson.url)}\n`,
      )

      const spinner = createSpinner('Waiting for payment...')
      try {
        return c.ok(
          await pollForBalance(c.var.client, credits.balance_mills, spinner),
        )
      } catch (error) {
        spinner.stop()
        throw error
      }
    },
  })
  .command('check', {
    description: 'Check your current credit balance',
    middleware: [requireAuth],
    output: z.string(),
    format: 'md',
    async run(c) {
      const res = await c.var.client.api.credits.$get()
      if (res.status === 401) return expiredSession(c)
      if (res.status !== 200)
        return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

      const json = await res.json()
      const dollars = (json.balance_mills / 1000).toFixed(3)
      let msg = `Credit balance: ${pc.green(`$${dollars}`)}`
      if (json.payment_method)
        msg += `\nPayment method: ${json.payment_method.brand} ending in ${json.payment_method.last4}`
      return c.ok(msg)
    },
  })

const invite = Cli.create('invite', {
  description: 'Manage organization invites (accept, create, list, revoke)',
  vars,
})
  .command('accept', {
    description: 'Accept an invite',
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
          message: 'Already a member of this organization.',
        })

      if (res.status !== 200)
        return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

      const json = await res.json()
      return c.ok(`Joined ${json.organization.login}.`, {
        cta: {
          description: 'Switch organization:',
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
    description: 'Create an invite link',
    middleware: [requireAuth],
    options: z.object({
      'expires-in': z.number().default(604800).describe('Expiry in seconds'),
      'max-uses': z.number().optional().describe('Maximum number of uses'),
      role: z
        .enum(['member', 'admin'])
        .default('member')
        .describe('Role for invited members'),
    }),
    alias: { 'expires-in': 'e', 'max-uses': 'm', role: 'r' },
    output: z.string(),
    format: 'md',
    async run(c) {
      const orgId = c.var.session?.organization_id
      if (!orgId)
        return c.error({
          code: 'NO_ACTIVE_ORG',
          message: 'No active organization. Switch first.',
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
          message: "You don't have permission to create invites.",
        })

      if (res.status !== 201)
        return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

      const json = await res.json()
      return c.ok(
        [
          `Invite created:`,
          '',
          `  ${json.invite.url}`,
          '',
          `Expires ${relativeTime(new Date(json.invite.expires_at)) ?? 'soon'} · role: ${json.invite.role}${json.invite.max_uses ? ` · max uses: ${json.invite.max_uses}` : ''}`,
        ].join('\n'),
      )
    },
  })
  .command('list', {
    description: 'List invites for the active organization',
    middleware: [requireAuth],
    output: z.string(),
    format: 'md',
    async run(c) {
      const orgId = c.var.session?.organization_id
      if (!orgId)
        return c.error({
          code: 'NO_ACTIVE_ORG',
          message: 'No active organization. Switch first.',
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

      const res = await c.var.client.api.orgs[':id'].invites.$get({
        param: { id: orgId },
      })

      if (res.status === 401) return expiredSession(c)

      if (res.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: "You don't have permission to view invites.",
        })

      const json = await res.json()
      if (!json.invites.length) return c.ok('No invites found.')

      const rows = json.invites.map((inv) => {
        const tokenCol = inv.token
        const roleCol = inv.role
        const usageCol = inv.max_uses
          ? `${inv.use_count}/${inv.max_uses} uses`
          : `${inv.use_count}/∞ uses`
        const expired = new Date(inv.expires_at) < new Date()
        const expiryCol = expired
          ? pc.dim('expired')
          : `expires ${relativeTime(new Date(inv.expires_at)) ?? 'soon'}`
        return [tokenCol, roleCol, usageCol, expiryCol] as const
      })

      const widths = [0, 0, 0, 0] as number[]
      for (const row of rows)
        for (let i = 0; i < 4; i++)
          widths[i] = Math.max(widths[i] ?? 0, row[i]?.length ?? 0)

      const lines = rows.map(
        (row) =>
          `  ${row[0].padEnd(widths[0] ?? 0)}  ${row[1].padEnd(widths[1] ?? 0)}  ${row[2].padEnd(widths[2] ?? 0)}  ${row[3]}`,
      )
      return c.ok(lines.join('\n'))
    },
  })
  .command('revoke', {
    description: 'Revoke an invite',
    middleware: [requireAuth],
    args: z.object({
      invite: z.string().optional().describe('Invite token or ID to revoke'),
    }),
    output: z.string(),
    format: 'md',
    async run(c) {
      const orgId = c.var.session?.organization_id
      if (!orgId)
        return c.error({
          code: 'NO_ACTIVE_ORG',
          message: 'No active organization. Switch first.',
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

      let inviteId = c.args.invite
      if (!inviteId) {
        const listRes = await c.var.client.api.orgs[':id'].invites.$get({
          param: { id: orgId },
        })
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

        if (listRes.status !== 200)
          return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })
        const listJson = await listRes.json()
        if (!listJson.invites.length)
          return c.error({
            code: 'NO_INVITES',
            message: 'No invites to revoke.',
          })

        const choices = listJson.invites.map(
          (inv) =>
            `${inv.token.slice(0, 12)}  ${pc.dim(inv.role)}  ${pc.dim(`${inv.use_count} uses`)}`,
        )
        const index = await select('Revoke invite:', choices)
        if (index === -1)
          return c.error({
            code: 'INVALID_SELECTION',
            message: 'Selection cancelled.',
          })
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

      const res = await c.var.client.api.orgs[':id'].invites[
        ':inviteId'
      ].$delete({
        param: { id: orgId, inviteId },
      })

      if (res.status === 401) return expiredSession(c)

      if (res.status === 404)
        return c.error({ code: 'NOT_FOUND', message: 'Invite not found.' })

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
      role: z
        .enum(['member', 'admin'])
        .default('member')
        .describe('Role for the new member'),
    }),
    alias: { role: 'r' },
    output: z.string(),
    format: 'md',
    async run(c) {
      const orgId = c.var.session?.organization_id
      if (!orgId)
        return c.error({
          code: 'NO_ACTIVE_ORG',
          message: 'No active organization. Switch first.',
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

      const res = await c.var.client.api.orgs[':id'].members.$post({
        param: { id: orgId },
        json: { login: c.args.login, role: c.options.role },
      })

      if (res.status === 401) return expiredSession(c)

      if (res.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: "You don't have permission to add members.",
        })

      if (res.status === 404)
        return c.error({ code: 'NOT_FOUND', message: 'Account not found.' })

      if (res.status === 409)
        return c.error({
          code: 'ALREADY_MEMBER',
          message: 'Already a member.',
        })

      if (res.status !== 201)
        return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })

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
      if (!orgId)
        return c.error({
          code: 'NO_ACTIVE_ORG',
          message: 'No active organization. Switch first.',
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

      const res = await c.var.client.api.orgs[':id'].members.$get({
        param: { id: orgId },
      })

      if (res.status === 401) return expiredSession(c)

      if (res.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: "You don't have permission to view members.",
        })

      const json = await res.json()
      if (!json.members.length) return c.ok('No members found.')

      const rows = json.members.map((m) => {
        const loginCol = m.login
        const roleCol = m.role
        const joinedCol = `joined ${relativeTime(new Date(m.created_at)) ?? 'just now'}`
        return [loginCol, roleCol, joinedCol] as const
      })

      const widths = [0, 0, 0] as number[]
      for (const row of rows)
        for (let i = 0; i < 3; i++)
          widths[i] = Math.max(widths[i] ?? 0, row[i]?.length ?? 0)

      const lines = rows.map(
        (row) =>
          `  ${row[0].padEnd(widths[0] ?? 0)}  ${row[1].padEnd(widths[1] ?? 0)}  ${pc.dim(row[2])}`,
      )
      return c.ok(lines.join('\n'))
    },
  })
  .command('remove', {
    description: 'Remove a member from the active organization',
    middleware: [requireAuth],
    args: z.object({
      login: z.string().optional().describe('Member login to remove'),
    }),
    output: z.string(),
    format: 'md',
    async run(c) {
      const orgId = c.var.session?.organization_id
      if (!orgId)
        return c.error({
          code: 'NO_ACTIVE_ORG',
          message: 'No active organization. Switch first.',
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

      const listRes = await c.var.client.api.orgs[':id'].members.$get({
        param: { id: orgId },
      })
      if (listRes.status === 401) {
        return expiredSession(c)
      }

      if (listRes.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: "You don't have permission to remove members.",
        })
      if (listRes.status !== 200)
        return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })
      const listJson = await listRes.json()
      if (!listJson.members.length)
        return c.error({
          code: 'NO_MEMBERS',
          message: 'No members to remove.',
        })

      let login = c.args.login
      if (!login) {
        const choices = listJson.members.map(
          (m) => `${m.login}  ${pc.dim(m.role)}`,
        )
        const index = await select('Remove member:', choices)
        if (index === -1)
          return c.error({
            code: 'INVALID_SELECTION',
            message: 'Selection cancelled.',
          })
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

      const res = await c.var.client.api.orgs[':id'].members[
        ':memberId'
      ].$delete({
        param: { id: orgId, memberId: match.id },
      })

      if (res.status === 401) return expiredSession(c)

      if (res.status === 403) {
        const json = await res.json()
        const message = (() => {
          if (json.error === 'cannot_remove_self')
            return 'Cannot remove yourself.'
          if (json.error === 'cannot_remove_owner')
            return 'Cannot remove an owner.'
          return "You don't have permission to remove members."
        })()
        return c.error({ code: 'FORBIDDEN', message })
      }

      if (res.status === 404)
        return c.error({ code: 'NOT_FOUND', message: 'Member not found.' })

      return c.ok(`Removed ${login} from organization.`)
    },
  })
  .command('role', {
    description: 'Change a member role',
    middleware: [requireAuth],
    args: z.object({
      login: z.string().optional().describe('Member login to change role for'),
    }),
    options: z.object({
      role: z.enum(['member', 'admin']).optional().describe('New role'),
    }),
    alias: { role: 'r' },
    output: z.string(),
    format: 'md',
    async run(c) {
      const orgId = c.var.session?.organization_id
      if (!orgId)
        return c.error({
          code: 'NO_ACTIVE_ORG',
          message: 'No active organization. Switch first.',
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

      const listRes = await c.var.client.api.orgs[':id'].members.$get({
        param: { id: orgId },
      })
      if (listRes.status === 401) {
        return expiredSession(c)
      }

      if (listRes.status === 403)
        return c.error({
          code: 'FORBIDDEN',
          message: "You don't have permission to change roles.",
        })
      if (listRes.status !== 200)
        return c.error({ code: 'UNKNOWN', message: 'Unexpected error.' })
      const listJson = await listRes.json()
      if (!listJson.members.length)
        return c.error({
          code: 'NO_MEMBERS',
          message: 'No members found.',
        })

      let login = c.args.login
      if (!login) {
        const choices = listJson.members.map(
          (m) => `${m.login}  ${pc.dim(m.role)}`,
        )
        const index = await select('Change role for:', choices)
        if (index === -1)
          return c.error({
            code: 'INVALID_SELECTION',
            message: 'Selection cancelled.',
          })
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
        const roleIndex = await select('New role:', ['member', 'admin'])
        if (roleIndex === -1)
          return c.error({
            code: 'INVALID_SELECTION',
            message: 'Selection cancelled.',
          })
        role = (['member', 'admin'] as const)[roleIndex]
        if (!role)
          return c.error({
            code: 'INVALID_SELECTION',
            message: 'Invalid selection.',
          })
      }

      const res = await c.var.client.api.orgs[':id'].members[
        ':memberId'
      ].$patch({
        param: { id: orgId, memberId: match.id },
        json: { role },
      })

      if (res.status === 401) return expiredSession(c)

      if (res.status === 403) {
        const json = await res.json()
        const message =
          json.error === 'cannot_change_owner'
            ? 'Cannot change owner role.'
            : "You don't have permission to change roles."
        return c.error({ code: 'FORBIDDEN', message })
      }

      if (res.status === 404)
        return c.error({ code: 'NOT_FOUND', message: 'Member not found.' })

      return c.ok(`Changed ${login} role to ${role}.`)
    },
  })

const org = Cli.create('org', {
  description:
    'Manage organizations (create, invite, list, members, show, switch)',
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
      if (res.status === 401) return expiredSession(c)

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
      if (res.status === 401) return expiredSession(c)

      const json = await res.json()
      let activeId = c.var.session?.organization_id

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
      const orgId = c.var.session?.organization_id
      if (!orgId) return c.ok(`personal ${pc.dim('(no organization)')}`)

      const res = await c.var.client.api.orgs[':id'].$get({
        param: { id: orgId },
      })
      if (res.status === 401) return expiredSession(c)

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
      if (res.status === 401) return expiredSession(c)

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
  description: 'Manage API tokens (create, list, delete)',
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

      if (res.status === 401) return expiredSession(c)

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

      if (res.status === 401) return expiredSession(c)

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
        return expiredSession(c)
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

      if (res.status === 401) return expiredSession(c)

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
