import child_process from 'node:child_process'
import { Type } from '@mariozechner/pi-ai'
import { defineTool, type ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Container, Spacer, Text, getKeybindings } from '@mariozechner/pi-tui'
import { createClient, defaultBaseUrl } from 'curl.md'
import { Auth, Session } from 'curl.md/internal'
import packageJson from '../package.json' with { type: 'json' }
import { dynamicBorder, SelectFilterList } from './ui.ts'
import {
  createHeaders,
  formatApiError,
  formatPathForDisplay,
  parseApiError,
  parseNumberHeader,
} from './utils.ts'

export default function (pi: ExtensionAPI) {
  const baseUrl = process.env.CURLMD_BASE_URL || defaultBaseUrl
  const apiKey = process.env.CURLMD_API_KEY
  const resolver = Auth.createResolver(baseUrl, apiKey)

  pi.registerCommand('md_login', {
    description: 'Log in to curl.md',
    async handler(_args, ctx) {
      const start = await Auth.startLogin(baseUrl)
      if (!start.ok) {
        ctx.ui.notify(`Failed to log in to curl.md: ${start.error.message}`, 'error')
        return
      }
      if (start.data.kind === 'already_authenticated') {
        ctx.ui.notify(
          `Already logged in to curl.md${start.data.login ? ` as ${start.data.login}` : ''}`,
          'info',
        )
        return
      }
      ;(() => {
        const cmd = (() => {
          if (process.platform === 'darwin') return 'open'
          if (process.platform === 'win32') return 'start'
          return 'xdg-open'
        })()
        child_process.exec(`${cmd} "${start.data.url}"`)
      })()
      const device = start.data
      const result = await ctx.ui.custom<Auth.Result<Auth.WaitForLoginData> | null>(
        (_tui, theme, _keybindings, done) => {
          const dim = (s: string) => theme.fg('dim', s)
          const accent = (s: string) => theme.fg('accent', s)
          const borderFn = (s: string) => theme.fg('border', s)

          const abortController = new AbortController()
          const cancel = () => {
            abortController.abort()
            done(null)
          }

          const container = new Container()
          container.addChild(dynamicBorder(borderFn))
          container.addChild(new Text(theme.bold('Login to curl.md'), 1, 0))
          container.addChild(new Spacer(1))
          container.addChild(new Text(accent(device.url), 1, 0))
          container.addChild(
            new Text(dim(`\x1b]8;;${device.url}\x07Cmd+click to open\x1b]8;;\x07`), 1, 0),
          )
          container.addChild(new Spacer(1))
          container.addChild(new Text(`Confirmation code: ${theme.bold(device.user_code)}`, 1, 0))
          container.addChild(new Spacer(1))
          container.addChild(new Text(dim('Waiting for browser authentication...'), 1, 0))
          container.addChild(new Text(dim('(escape/ctrl+c to cancel)'), 1, 0))
          container.addChild(dynamicBorder(borderFn))

          const kb = getKeybindings()
          ;(container as Container & { handleInput(data: string): void }).handleInput = (
            data: string,
          ) => {
            if (kb.matches(data, 'tui.select.cancel') || data === '\x03') cancel()
          }

          Auth.waitForLogin(baseUrl, device, { signal: abortController.signal })
            .then(done)
            .catch(() => done(null))
          return container
        },
      )
      if (!result) return
      if (!result.ok) {
        ctx.ui.notify(`Failed to log in to curl.md: ${result.error.message}`, 'error')
        return
      }
      ctx.ui.notify(
        `Logged in${result.data.login ? ` as ${result.data.login}` : ''} to curl.md`,
        'info',
      )
    },
  })

  pi.registerCommand('md_logout', {
    description: 'Log out of curl.md',
    async handler(_args, ctx) {
      if (!Session.read(baseUrl)) {
        ctx.ui.notify('Already logged out of curl.md', 'info')
        return
      }
      const result = await Auth.logout(baseUrl)
      if (!result.ok) {
        ctx.ui.notify(`Failed to log out of curl.md: ${result.error.message}`, 'error')
        return
      }
      ctx.ui.notify(
        `Logged out${result.data.login ? ` of ${result.data.login}` : ''} from curl.md`,
        'info',
      )
    },
  })

  pi.registerCommand('md_org', {
    description: 'Switch active curl.md organization',
    async handler(args, ctx) {
      const authHeaders = await resolver()
      if (!authHeaders) {
        ctx.ui.notify('Not authenticated with curl.md. Run md_login first.', 'error')
        return
      }

      const client = createClient(baseUrl, { headers: createHeaders(authHeaders) })
      const [orgsRes, meRes] = await Promise.all([
        client.api.orgs.$get(),
        client.api.auth.me.$get(),
      ])
      if (!orgsRes.ok || !meRes.ok) {
        ctx.ui.notify('Failed to fetch curl.md organizations.', 'error')
        return
      }

      const orgsJson = await orgsRes.json()
      const meJson = await meRes.json()
      const accountLogin = meJson.account?.login ?? 'account'
      const currentOrgId = Session.read(baseUrl)?.organization_id
      const login = args.trim()

      if (login) {
        if (login === accountLogin || login === 'account') {
          Session.write({ organization_id: undefined }, baseUrl)
          ctx.ui.notify(`Switched curl.md account to ${accountLogin}`, 'info')
          return
        }

        const match = orgsJson.organizations.find((organization) => organization.login === login)
        if (!match) {
          ctx.ui.notify(`curl.md organization "${login}" not found.`, 'error')
          return
        }

        Session.write({ organization_id: match.id }, baseUrl)
        ctx.ui.notify(`Switched curl.md organization to ${match.login}`, 'info')
        return
      }

      const choices = [
        ...orgsJson.organizations.map((o) => ({
          id: o.id,
          kind: 'organization' as const,
          label: o.login,
        })),
        {
          id: undefined,
          kind: 'account' as const,
          label: accountLogin,
        },
      ]

      const choice = await (async () => {
        if (typeof ctx.ui.custom === 'function') {
          return ctx.ui.custom<
            | {
                id: string | undefined
                kind: 'account' | 'organization'
                label: string
              }
            | undefined
          >((_tui, theme, _keybindings, done) => {
            return new SelectFilterList(
              theme,
              choices,
              {
                emptyText: '  No matching organizations',
                footerText: '(escape/ctrl+c to cancel)',
                formatItem: (choice, props) => {
                  const { isSelected, theme } = props
                  const prefix = isSelected ? theme.fg('accent', '→ ') : '  '
                  const label = isSelected ? theme.fg('accent', choice.label) : choice.label
                  const badge = choice.kind === 'account' ? ` ${theme.fg('dim', '[account]')}` : ''
                  const check = choice.id === currentOrgId ? ` ${theme.fg('success', '✓')}` : ''
                  return `${prefix}${label}${badge}${check}`
                },
                placeholder: 'Type to filter. Use arrows to move, enter to select.',
                searchText: (choice) => `${choice.label} ${choice.kind}`,
                title: 'Switch curl.md organization',
              },
              done,
              () => done(undefined),
            )
          })
        }

        const options = choices.map((choice) => {
          const badge = choice.kind === 'account' ? ' (account)' : ''
          const check = choice.id === currentOrgId ? ' ✓' : ''
          return `${choice.label}${badge}${check}`
        })
        const selected = await ctx.ui.select('Switch to:', options)
        if (!selected) return undefined

        const index = options.indexOf(selected)
        return choices[index]
      })()
      if (!choice) return

      Session.write({ organization_id: choice.id }, baseUrl)
      ctx.ui.notify(`Switched curl.md ${choice.kind} to ${choice.label}`, 'info')
    },
  })

  pi.registerCommand('md_status', {
    description: 'Show curl.md status',
    async handler(_args, ctx) {
      const lines = [`${packageJson.name} v${packageJson.version}`]
      const cliPath = (() => {
        const result = child_process.spawnSync(
          process.platform === 'win32' ? 'where' : 'which',
          ['curl.md'],
          {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          },
        )
        if (result.error || result.status !== 0) return null
        return result.stdout.split(/\r?\n/).find(Boolean)?.trim() ?? null
      })()
      const cliDisplay = cliPath ? formatPathForDisplay(cliPath) : 'not installed'

      const authHeaders = await resolver()
      if (!authHeaders) {
        lines.push('Auth: Not authenticated. Run md_login or set CURLMD_API_KEY.')
        lines.push('Tool: read_web_page (alias: md_fetch)')
        lines.push(`CLI: ${cliDisplay}`)
        if (baseUrl !== defaultBaseUrl) lines.push(`Base URL: ${baseUrl}`)
        ctx.ui.notify(lines.join('\n'), 'info')
        return
      }

      const authType = apiKey ? 'api_key' : 'session'
      const status = await (async () => {
        try {
          const client = createClient(baseUrl, {
            headers: createHeaders({
              authorization: authHeaders.authorization,
              expires_at: null,
              organization_id: null,
            }),
          })
          const res = await client.api.auth.me.$get()
          if (!res.ok) {
            const json = await res.json().catch((_error) => undefined)
            const error = parseApiError(json)
            return {
              message: error ? formatApiError(error) : `status ${res.status}`,
              type: 'error' as const,
            }
          }

          const json = await res.json()
          if (!json.account) return { type: 'unauthenticated' as const }
          const activeOrganization = authHeaders.organization_id
            ? json.account.organizations?.find(
                (organization) => organization.id === authHeaders.organization_id,
              )
            : null
          return {
            login: json.account.login,
            organization: activeOrganization?.login ?? 'none',
            type: 'authenticated' as const,
          }
        } catch (error) {
          return {
            message: error instanceof Error ? error.message : 'unknown error',
            type: 'error' as const,
          }
        }
      })()
      if (status.type === 'authenticated') {
        lines.push(`Auth: ${authType} (${status.login})`)
        lines.push(`Organization: ${status.organization}`)
      } else if (status.type === 'unauthenticated') {
        lines.push(
          authType === 'api_key'
            ? 'Auth: api_key not authenticated. Refresh CURLMD_API_KEY.'
            : 'Auth: session not authenticated. Run md_login or set CURLMD_API_KEY.',
        )
      } else {
        lines.push(`Auth: ${authType} verification failed. ${status.message}`)
      }
      lines.push('Tool: read_web_page (alias: md_fetch)')
      lines.push(`CLI: ${cliDisplay}`)
      if (baseUrl !== defaultBaseUrl) lines.push(`Base URL: ${baseUrl}`)
      ctx.ui.notify(lines.join('\n'), 'info')
    },
  })

  const readWebPageTool = defineTool({
    description: 'Fetch a URL through curl.md and return markdown optimized for coding agents.',
    label: 'curl.md Fetch',
    name: 'read_web_page',
    parameters: Type.Object({
      fresh: Type.Optional(
        Type.Boolean({
          description:
            'Bypass curl.md cache when freshness matters, such as changelogs, release notes, or recently updated docs.',
        }),
      ),
      keywords: Type.Optional(
        Type.Array(
          Type.String({
            description:
              'Keyword to pre-filter sections by. Prefer 2-5 distinct terms when only part of a long page matters.',
          }),
        ),
      ),
      mode: Type.Optional(
        Type.Union([
          Type.Literal('rush', {
            description:
              'Lower-latency mode. Best when you already know the section or answer you want.',
          }),
          Type.Literal('smart', {
            description:
              'Higher-quality narrowing mode. Best for long or noisy pages where better extraction matters more than speed.',
          }),
        ]),
      ),
      objective: Type.Optional(
        Type.String({
          description:
            'Specific question or goal to answer from the page. Prefer concrete objectives like "compare pricing tiers" or "find auth header requirements".',
        }),
      ),
      url: Type.String({
        description:
          'HTTP(S) URL or bare domain to fetch via curl.md. Prefer the canonical docs or article URL you want summarized.',
      }),
    }),
    prepareArguments(args) {
      const rawArgs = args as Record<string, unknown>
      if (typeof rawArgs.url !== 'string') throw new Error('Invalid arguments')

      const url = new URL(rawArgs.url.includes('://') ? rawArgs.url : `https://${rawArgs.url}`)
      if (!/^https?:$/.test(url.protocol)) throw new Error('URL must use http or https')

      return { ...rawArgs, url: url.toString() }
    },
    promptGuidelines: [
      'Use read_web_page for documentation pages, changelogs, articles, and other web URLs when you want markdown back from curl.md.',
      'Set objective to the exact question you need answered when only part of the page matters.',
      'Add keywords for long pages when you know the relevant terms, and choose rush for speed or smart for higher-quality narrowing.',
    ],
    promptSnippet:
      'Fetch a web page via curl.md. Use objective for a concrete question, keywords for long pages, rush for speed, smart for better narrowing.',
    renderCall(args, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text('', 0, 0)
      let content = `${theme.fg('toolTitle', theme.bold('read_web_page'))} ${theme.fg('accent', args.url)}`
      const options = (() => {
        const options: string[] = []

        // Mirror only the optional flags the model actually set so the call preview stays compact.
        if (args.objective) options.push(`objective: ${args.objective}`)
        if (args.keywords && args.keywords.length > 0)
          options.push(`keywords: ${args.keywords.join(', ')}`)
        if (args.mode) options.push(`mode: ${args.mode}`)
        if (args.fresh) options.push('fresh')

        return options
      })()
      if (options.length > 0) content += `\n${theme.fg('dim', options.join('\n'))}`
      text.setText(content)
      return text
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text('', 0, 0)

      if (isPartial) {
        text.setText(theme.fg('warning', 'Fetching via curl.md...'))
        return text
      }

      const content = result.content.find((item) => item.type === 'text')
      if (!content || content.type !== 'text') {
        text.setText(theme.fg('dim', 'No content'))
        return text
      }

      if (!expanded) {
        const preview = (() => {
          // Strip curl.md wrappers before building the collapsed preview shown in the tool row.
          const previewContent = (
            content.text.startsWith('---\n')
              ? content.text.replace(/^---\n[\s\S]*?\n---\n+/, '')
              : content.text
          ).replace(/\n\n---\n\nPowered by \[curl\.md\]\(https:\/\/curl\.md\)$/, '')

          const lines = previewContent
            .split('\n')
            .map((line) => line.trimEnd())
            .filter(Boolean)

          return {
            lines: lines.slice(0, 3),
            remainingLines: Math.max(0, lines.length - 3),
          }
        })()
        const lines = [...preview.lines]
        if (preview.remainingLines > 0) {
          lines.push(
            theme.fg(
              'dim',
              `... (${preview.remainingLines} more line${preview.remainingLines === 1 ? '' : 's'}, ctrl+o to expand)`,
            ),
          )
        }
        text.setText(lines.join('\n'))
        return text
      }

      text.setText(content.text)
      return text
    },
    async execute(_toolCallId, params, signal) {
      let authHeaders = await resolver()
      let authType: 'anon' | 'api_key' | 'session' = (() => {
        if (apiKey) return 'api_key'
        if (authHeaders) return 'session'
        return 'anon'
      })()

      const client = createClient(baseUrl, {
        headers: apiKey ? createHeaders(null) : createHeaders(authHeaders),
      })
      let res = await client.fetch(params.url, {
        fresh: params.fresh,
        keywords: params.keywords,
        mode: params.mode,
        objective: params.objective,
        options: { init: { signal } },
        token: apiKey,
      })

      if (res.status === 401 && authType === 'session') {
        authHeaders = await resolver()
        if (!authHeaders) authType = 'anon'
        const client = createClient(baseUrl, {
          headers: apiKey ? createHeaders(null) : createHeaders(authHeaders),
        })
        res = await client.fetch(params.url, {
          fresh: params.fresh,
          keywords: params.keywords,
          mode: params.mode,
          objective: params.objective,
          options: { init: { signal } },
          token: apiKey,
        })
      }

      if (res.status === 400) {
        const json = await res.json()
        const errorMessage = (() => {
          if (
            typeof json !== 'object' ||
            json === null ||
            !('issues' in json) ||
            !Array.isArray(json.issues)
          )
            return json.message

          return json.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
        })()
        throw new Error(errorMessage)
      }

      if (res.status === 401) {
        if (authType === 'api_key')
          throw new Error('curl.md authentication failed. Fix CURLMD_API_KEY.')
        if (authType === 'session')
          throw new Error('curl.md authentication failed. Run md_login again.')
        throw new Error('curl.md authentication required. Set CURLMD_API_KEY or run md_login.')
      }

      if (res.status === 403) {
        const json = await res.json()
        Session.write({ organization_id: undefined }, baseUrl)
        if (authType === 'api_key') throw new Error(`${json.message}. Check CURLMD_API_KEY access.`)
        throw new Error(`${json.message}. Run md_login or set CURLMD_API_KEY.`)
      }

      if (res.status === 429) {
        const json = await res.json()
        const retryAfter = res.headers.get('retry-after')
        const message = retryAfter ? `${json.message}. Try again in ${retryAfter}s` : json.message

        if (authType === 'anon')
          throw new Error(`${message}. Set CURLMD_API_KEY or run md_login for higher limits.`)

        throw new Error(`${message}. Add credits with \`curl.md credits add\` if needed.`)
      }

      if (!res.ok) {
        const json = await res
          .clone()
          .json()
          .catch((_error) => undefined)
        const error = parseApiError(json)
        if (error) throw new Error(formatApiError(error))

        const text = await res.text()
        throw new Error(text || `curl.md request failed with status ${res.status}`)
      }

      const json = await res.json()
      return {
        content: [{ text: json.content, type: 'text' as const }],
        details: {
          auth: authType,
          cache: res.headers.get('x-cache') || undefined,
          credits_remaining: parseNumberHeader(res.headers.get('x-credits-remaining')),
          fresh: params.fresh || undefined,
          keywords: params.keywords,
          mode: params.mode,
          objective: params.objective,
          request_id: res.headers.get('x-request-id') || undefined,
          tokens_count: parseNumberHeader(res.headers.get('x-tokens-count')),
          tokens_saved: parseNumberHeader(res.headers.get('x-tokens-saved')),
          url: params.url,
        },
      }
    },
  })

  pi.registerTool(readWebPageTool)
  pi.registerTool(
    defineTool({
      ...readWebPageTool,
      description: 'Alias for read_web_page.',
      label: 'curl.md Fetch (alias)',
      name: 'md_fetch',
      promptGuidelines: ['Prefer read_web_page. md_fetch is a compatibility alias.'],
      promptSnippet: 'Alias for read_web_page.',
    }),
  )
}
