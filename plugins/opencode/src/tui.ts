import * as childProcess from 'node:child_process'
import * as os from 'node:os'
import type * as opencodePluginTui from '@opencode-ai/plugin/tui'
import * as curlmd from 'curl.md'
import * as curlmdInternal from 'curl.md/internal'
import packageJson from '../package.json' with { type: 'json' }
import { createHeaders, formatApiError, parseApiError } from './utils.ts'

const authStatusToastDurationMs = 6 * 1000 // 6 seconds
const statusToastDurationMs = 10 * 1000 // 10 seconds

export const tuiPlugin: opencodePluginTui.TuiPluginModule = {
  id: '@curl.md/opencode',
  async tui(api: opencodePluginTui.TuiPluginApi) {
    const baseUrl = process.env.CURLMD_BASE_URL || curlmd.defaultBaseUrl
    const apiKey = process.env.CURLMD_API_KEY
    let loginAbortController: AbortController | null = null
    const resolver = curlmdInternal.Auth.createResolver(baseUrl, apiKey)

    api.lifecycle.onDispose(() => loginAbortController?.abort())

    api.command.register(() => [
      {
        category: 'curl.md',
        description: 'Log in',
        onSelect: async () => {
          if (loginAbortController) {
            api.ui.toast({
              message: 'Login already in progress.',
              title: 'curl.md',
              variant: 'info',
            })
            return
          }

          const start = await curlmdInternal.Auth.startLogin(baseUrl)
          if (!start.ok) {
            api.ui.toast({
              message: `Failed to log in: ${start.error.message}`,
              title: 'curl.md',
              variant: 'error',
            })
            return
          }

          if (start.data.kind === 'already_authenticated') {
            api.ui.dialog.clear()
            api.ui.toast({
              duration: authStatusToastDurationMs,
              message: buildAlreadyAuthenticatedMessage(start.data.login),
              title: 'curl.md',
              variant: 'info',
            })
            return
          }

          const device = start.data

          openBrowser(device.url)
          api.ui.dialog.replace(() =>
            api.ui.DialogAlert({
              message: buildLoginPrompt(device.url, device.user_code),
              title: 'Login to curl.md',
            }),
          )

          const abortController = new AbortController()
          loginAbortController = abortController

          try {
            const result = await curlmdInternal.Auth.waitForLogin(baseUrl, device, {
              signal: abortController.signal,
            })

            api.ui.dialog.clear()
            if (!result.ok) {
              api.ui.toast({
                message: `Failed to log in: ${result.error.message}`,
                title: 'curl.md',
                variant: 'error',
              })
              return
            }

            api.ui.toast({
              duration: authStatusToastDurationMs,
              message: buildLoginSuccessMessage(result.data.login),
              title: 'curl.md',
              variant: 'success',
            })
          } catch (error) {
            if (abortController.signal.aborted) return

            api.ui.dialog.clear()
            api.ui.toast({
              message: error instanceof Error ? error.message : 'Failed to log in.',
              title: 'curl.md',
              variant: 'error',
            })
          } finally {
            if (loginAbortController === abortController) loginAbortController = null
          }
        },
        slash: { name: 'curl_md_login' },
        suggested: true,
        title: 'Log in',
        value: 'curlmd.login',
      },
      {
        category: 'curl.md',
        description: 'Log out',
        onSelect: async () => {
          api.ui.dialog.clear()

          if (!curlmdInternal.Session.read(baseUrl)) {
            api.ui.toast({
              duration: authStatusToastDurationMs,
              message: buildAlreadyLoggedOutMessage(),
              title: 'curl.md',
              variant: 'info',
            })
            return
          }

          const result = await curlmdInternal.Auth.logout(baseUrl)
          if (!result.ok) {
            api.ui.toast({
              message: `Failed to log out: ${result.error.message}`,
              title: 'curl.md',
              variant: 'error',
            })
            return
          }

          api.ui.toast({
            duration: authStatusToastDurationMs,
            message: buildLogoutSuccessMessage(result.data.login),
            title: 'curl.md',
            variant: 'info',
          })
        },
        slash: { name: 'curl_md_logout' },
        title: 'Log out',
        value: 'curlmd.logout',
      },
      {
        category: 'curl.md',
        description: 'Switch organization',
        onSelect: async () => {
          const authHeaders = await resolver()
          if (!authHeaders) {
            api.ui.dialog.clear()
            api.ui.toast({
              duration: authStatusToastDurationMs,
              message: 'Not authenticated. Run /curl_md_login first.',
              title: 'curl.md',
              variant: 'error',
            })
            return
          }

          const client = curlmd.createClient(baseUrl, { headers: createHeaders(authHeaders) })
          const [orgsRes, meRes] = await Promise.all([
            client.api.orgs.$get(),
            client.api.auth.me.$get(),
          ])

          if (orgsRes.status !== 200 || meRes.status !== 200) {
            api.ui.dialog.clear()
            api.ui.toast({
              message: 'Failed to fetch organizations.',
              title: 'curl.md',
              variant: 'error',
            })
            return
          }

          const orgsJson = await orgsRes.json()
          const meJson = await meRes.json()
          if (!meJson.account) {
            api.ui.dialog.clear()
            api.ui.toast({
              duration: authStatusToastDurationMs,
              message: 'Not authenticated. Run /curl_md_login first.',
              title: 'curl.md',
              variant: 'error',
            })
            return
          }

          const currentOrgId = curlmdInternal.Session.read(baseUrl)?.organization_id
          const accountLogin = meJson.account.login || 'account'
          const options: opencodePluginTui.TuiDialogSelectOption<OrgChoice>[] = [
            {
              description: currentOrgId ? 'Use personal account' : 'Current account',
              title: accountLogin,
              value: {
                id: undefined,
                kind: 'account' as const,
                label: accountLogin,
              },
            },
            ...orgsJson.organizations.map((organization) => ({
              description:
                organization.id === currentOrgId
                  ? 'Current organization'
                  : 'Switch to organization',
              title: organization.login,
              value: {
                id: organization.id,
                kind: 'organization' as const,
                label: organization.login,
              },
            })),
          ]

          api.ui.dialog.replace(() =>
            api.ui.DialogSelect({
              onSelect(option) {
                curlmdInternal.Session.write({ organization_id: option.value.id }, baseUrl)
                api.ui.dialog.clear()
                api.ui.toast({
                  duration: authStatusToastDurationMs,
                  message: buildOrgSwitchMessage(option.value.kind, option.value.label),
                  title: 'curl.md',
                  variant: 'info',
                })
              },
              options,
              placeholder: 'Choose account or organization',
              title: 'Switch organization',
            }),
          )
        },
        slash: { name: 'curl_md_org' },
        title: 'Switch organization',
        value: 'curlmd.org',
      },
      {
        category: 'curl.md',
        description: 'Show status',
        onSelect: async () => {
          api.ui.dialog.clear()

          const lines = [`${packageJson.name} v${packageJson.version}`]
          const cliDisplay = findCliPath() || 'not installed'
          const authHeaders = await resolver()
          if (!authHeaders) {
            lines.push('Auth: Not authenticated. Run /curl_md_login or set CURLMD_API_KEY.')
            lines.push('Tool: curl_md')
            lines.push(`CLI: ${cliDisplay}`)
            if (baseUrl !== curlmd.defaultBaseUrl) lines.push(`Base URL: ${baseUrl}`)
            api.ui.toast({
              duration: statusToastDurationMs,
              message: lines.join('\n'),
              title: 'curl.md',
              variant: 'info',
            })
            return
          }

          const authType = apiKey ? 'api_key' : 'session'
          const status = await readStatus(
            baseUrl,
            authHeaders.authorization,
            authHeaders.organization_id,
          )
          if (status.type === 'authenticated') {
            lines.push(`Auth: ${authType} (${status.login})`)
            lines.push(`Organization: ${status.organization}`)
          } else if (status.type === 'unauthenticated') {
            lines.push(
              authType === 'api_key'
                ? 'Auth: api_key not authenticated. Refresh CURLMD_API_KEY.'
                : 'Auth: session not authenticated. Run /curl_md_login or set CURLMD_API_KEY.',
            )
          } else {
            lines.push(`Auth: ${authType} verification failed. ${status.message}`)
          }

          lines.push('Tool: curl_md')
          lines.push(`CLI: ${cliDisplay}`)
          if (baseUrl !== curlmd.defaultBaseUrl) lines.push(`Base URL: ${baseUrl}`)
          api.ui.toast({
            duration: statusToastDurationMs,
            message: lines.join('\n'),
            title: 'curl.md',
            variant: 'info',
          })
        },
        slash: { name: 'curl_md_status' },
        title: 'Show status',
        value: 'curlmd.status',
      },
    ])
  },
}

export default tuiPlugin

type OrgChoice = {
  id: string | undefined
  kind: 'account' | 'organization'
  label: string
}

function buildAlreadyAuthenticatedMessage(login: string | null) {
  if (!login) return withApiKeyNote('Already logged in.')
  return withApiKeyNote(`Already logged in as ${login}.`)
}

function buildAlreadyLoggedOutMessage() {
  return withApiKeyNote('Already logged out.')
}

function buildOrgSwitchMessage(kind: 'account' | 'organization', label: string) {
  if (kind === 'account') return withApiKeyNote(`Switched account to ${label}.`)
  return withApiKeyNote(`Switched organization to ${label}.`)
}

function buildLoginPrompt(url: string, userCode: string) {
  return [
    'Complete authentication in your browser.',
    '',
    `Confirmation code: ${userCode}`,
    `URL: ${url}`,
    '',
    'This dialog closes automatically when login completes.',
  ].join('\n')
}

function buildLoginSuccessMessage(login: string | null) {
  if (!login) return withApiKeyNote('Logged in.')
  return withApiKeyNote(`Logged in as ${login}.`)
}

function buildLogoutSuccessMessage(login: string | null) {
  if (!login) return withApiKeyNote('Logged out.')
  return withApiKeyNote(`Logged out of ${login}.`)
}

function findCliPath() {
  const result = childProcess.spawnSync(
    process.platform === 'win32' ? 'where' : 'which',
    ['curl.md'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  )
  if (result.error || result.status !== 0) return null

  const cliPath = result.stdout.split(/\r?\n/).find(Boolean)?.trim()
  return cliPath ? formatPathForDisplay(cliPath) : null
}

function formatPathForDisplay(value: string) {
  const homeDir = os.homedir()
  if (value === homeDir) return '~'
  if (value.startsWith(`${homeDir}/`)) return `~${value.slice(homeDir.length)}`
  return value
}

function openBrowser(url: string) {
  try {
    const child = (() => {
      if (process.platform === 'win32')
        return childProcess.spawn('cmd', ['/c', 'start', '', url], {
          detached: true,
          stdio: 'ignore',
        })
      if (process.platform === 'darwin')
        return childProcess.spawn('open', [url], { detached: true, stdio: 'ignore' })
      return childProcess.spawn('xdg-open', [url], { detached: true, stdio: 'ignore' })
    })()

    child.once('error', () => undefined)
    child.unref()
  } catch {}
}

async function readStatus(baseUrl: string, authorization: string, organizationId: string | null) {
  try {
    const client = curlmd.createClient(baseUrl, {
      headers: createHeaders({
        authorization,
        expires_at: null,
        organization_id: null,
      }),
    })
    const res = await client.api.auth.me.$get()
    if (res.status !== 200) {
      const json = await res.json().catch(() => undefined)
      const error = parseApiError(json)
      return {
        message: error ? formatApiError(error) : `status ${res.status}`,
        type: 'error' as const,
      }
    }

    const json = await res.json()
    if (!json.account) return { type: 'unauthenticated' as const }

    const activeOrganization = organizationId
      ? json.account.organizations?.find((organization) => organization.id === organizationId)
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
}

function withApiKeyNote(message: string) {
  if (!process.env.CURLMD_API_KEY) return message
  return `${message} CURLMD_API_KEY still overrides plugin requests.`
}
