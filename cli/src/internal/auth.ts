import { createClient } from '../client.ts'
import { Session } from './session.ts'

const authHeaderRefreshSkewMs = 60_000 // 1 minute
const defaultRetryAfterSeconds = 5
const defaultLoginTimeoutMs = 5 * 60 * 1000 // 5 minutes

export const Auth = {
  createResolver(baseUrl: string, apiKey?: string) {
    const client = createClient(baseUrl)
    let cachedAuth: Omit<Auth.Headers, 'organization_id'> | null = null
    let cachedRefreshToken: string | null = null
    let pendingAuth: Promise<Omit<Auth.Headers, 'organization_id'> | null> | null = null
    let pendingRefreshToken: string | null = null

    return async function resolveAuth(): Promise<Auth.Headers | null> {
      if (apiKey)
        return {
          authorization: `Bearer ${apiKey}`,
          expires_at: null,
          organization_id: null,
        }

      const currentSession = Session.read(baseUrl)
      if (!currentSession) {
        clearCache()
        return null
      }

      const refreshToken = currentSession.refresh_token
      if (!refreshToken) {
        clearCache()
        return null
      }

      if (
        currentSession.refresh_token_expires_at &&
        Date.parse(currentSession.refresh_token_expires_at) <= Date.now()
      ) {
        Session.delete(baseUrl)
        clearCache()
        return null
      }

      if (
        cachedAuth &&
        cachedRefreshToken === refreshToken &&
        !shouldRefreshHeaders(cachedAuth.expires_at)
      )
        return {
          ...cachedAuth,
          organization_id: currentSession.organization_id ?? null,
        }

      if (!pendingAuth || pendingRefreshToken !== refreshToken) {
        pendingRefreshToken = refreshToken
        pendingAuth = mintSessionAuthHeaders(client, baseUrl, refreshToken)
      }

      const pending = pendingAuth
      const result = await pending
      try {
        cachedAuth = result
        cachedRefreshToken = cachedAuth ? refreshToken : null
      } finally {
        if (pendingAuth === pending) {
          pendingAuth = null
          pendingRefreshToken = null
        }
      }

      const latestSession = Session.read(baseUrl)
      if (!latestSession) {
        clearCache()
        return null
      }

      if (latestSession.refresh_token !== refreshToken) {
        cachedAuth = null
        cachedRefreshToken = null
        return resolveAuth()
      }

      if (!cachedAuth) return null

      return {
        ...cachedAuth,
        organization_id: latestSession.organization_id ?? null,
      }
    }

    function clearCache() {
      cachedAuth = null
      cachedRefreshToken = null
      pendingAuth = null
      pendingRefreshToken = null
    }
  },

  async startLogin(baseUrl: string): Promise<Auth.Result<Auth.StartLoginData>> {
    const client = createClient(baseUrl)
    if (Session.read(baseUrl)) {
      const authHeaders = await Auth.createResolver(baseUrl)()
      if (authHeaders) {
        const account = await readAccountLogin(client, authHeaders.authorization)
        if (account.status === 'ok' && account.login)
          return {
            ok: true,
            data: {
              kind: 'already_authenticated',
              login: account.login,
            },
          }
      }
    }

    const response = await client.api.auth.device.$post()
    if ((response as Response).status !== 200) {
      const error = await readApiError(response as Response)
      const retryAfter = readRetryAfterMs(response as Response)
      if (retryAfter !== undefined)
        error.message = `${error.message}. Try again in ${retryAfter / 1000}s`
      return { ok: false, error }
    }

    const json = (await (response as Response).json()) as {
      code: string
      interval?: number
      user_code: string
      verification_uri: string
    }
    return {
      ok: true,
      data: {
        kind: 'device_flow',
        code: json.code,
        interval: json.interval ?? defaultRetryAfterSeconds,
        url: `${json.verification_uri}?user_code=${json.user_code}`,
        user_code: json.user_code,
        verification_uri: json.verification_uri,
      },
    }
  },

  async waitForLogin(
    baseUrl: string,
    device: Pick<Auth.DeviceFlow, 'code' | 'interval'>,
    options: Auth.WaitForLoginOptions = {},
  ): Promise<Auth.Result<Auth.WaitForLoginData>> {
    const client = createClient(baseUrl)
    const timeoutMs = options.timeoutMs ?? defaultLoginTimeoutMs
    const deadline = Date.now() + timeoutMs
    const intervalMs = device.interval * 1000

    while (Date.now() < deadline) {
      throwIfAborted(options.signal)

      const response = await client.api.auth.device.token.$post(
        {
          json: { code: device.code },
        },
        { init: { signal: options.signal } },
      )

      if ((response as Response).status === 200) {
        const json = (await (response as Response).json()) as {
          authorization: string
          expires_at: string
          refresh_token: string
          refresh_token_expires_at: string
        }

        Session.write(
          {
            organization_id: undefined,
            refresh_token: json.refresh_token,
            refresh_token_expires_at: json.refresh_token_expires_at,
          },
          baseUrl,
        )

        const account = await readAccountLogin(client, json.authorization)
        return {
          ok: true,
          data: {
            expires_at: json.expires_at,
            login: account.status === 'ok' ? account.login : null,
          },
        }
      }

      if ((response as Response).status === 429) {
        const retryAfterMs = readRetryAfterMs(response as Response) ?? intervalMs
        if (!(await waitForNextPoll(deadline, retryAfterMs, options.signal))) break
        continue
      }

      const error = await readApiError(response as Response)
      if (error.code === 'authorization_pending') {
        if (!(await waitForNextPoll(deadline, intervalMs, options.signal))) break
        continue
      }

      return { ok: false, error }
    }

    return {
      ok: false,
      error: { code: 'timeout', message: 'Login timed out. Try again.' },
    }
  },

  async logout(baseUrl: string): Promise<Auth.Result<Auth.LogoutData>> {
    const client = createClient(baseUrl)
    const session = Session.read(baseUrl)
    let login: string | null = null

    if (session?.refresh_token) {
      const authHeaders = await mintSessionAuthHeaders(client, baseUrl, session.refresh_token)
      if (authHeaders) {
        const account = await readAccountLogin(client, authHeaders.authorization)
        if (account.status === 'ok') login = account.login
      }

      try {
        await client.api.auth.logout.$post(
          {},
          {
            headers: {
              Authorization: authHeaders?.authorization ?? `Bearer ${session.refresh_token}`,
            },
          },
        )
      } catch {}
    }

    Session.delete(baseUrl)
    return { ok: true, data: { login } }
  },
}

export declare namespace Auth {
  export type Headers = {
    authorization: string
    expires_at: string | null
    organization_id: string | null
  }

  export type Result<T> = { ok: true; data: T } | { ok: false; error: Error }

  export type Error = {
    code: string
    message: string
  }

  export type DeviceFlow = {
    kind: 'device_flow'
    code: string
    interval: number
    url: string
    user_code: string
    verification_uri: string
  }

  export type StartLoginData =
    | {
        kind: 'already_authenticated'
        login: string | null
      }
    | DeviceFlow

  export type WaitForLoginData = {
    expires_at: string | null
    login: string | null
  }

  export type WaitForLoginOptions = {
    signal?: AbortSignal | undefined
    timeoutMs?: number | undefined
  }

  export type LogoutData = {
    login: string | null
  }
}

function shouldRefreshHeaders(expiresAt: string | null) {
  if (!expiresAt) return false

  const time = Date.parse(expiresAt)
  if (!Number.isFinite(time)) return true
  return time - authHeaderRefreshSkewMs <= Date.now()
}

async function mintSessionAuthHeaders(
  client: ReturnType<typeof createClient>,
  baseUrl: string,
  refreshToken: string,
) {
  try {
    const response = await client.api.auth.headers.$post(
      {},
      {
        headers: {
          Authorization: `Bearer ${refreshToken}`,
        },
      },
    )

    if ((response as Response).status === 200) {
      const json = (await (response as Response).json()) as {
        authorization: string
        expires_at: string
        refresh_token?: string
        refresh_token_expires_at?: string
      }
      if (json.refresh_token)
        Session.write(
          {
            refresh_token: json.refresh_token,
            refresh_token_expires_at: json.refresh_token_expires_at,
          },
          baseUrl,
        )

      return {
        authorization: json.authorization,
        expires_at: json.expires_at,
      } as Omit<Auth.Headers, 'organization_id'>
    }

    if ((response as Response).status === 401) Session.delete(baseUrl)

    return null
  } catch {
    return null
  }
}

async function readAccountLogin(client: ReturnType<typeof createClient>, authorization: string) {
  try {
    const response = await client.api.auth.me.$get(
      {},
      {
        headers: {
          Authorization: authorization,
        },
      },
    )
    if ((response as Response).status !== 200) return { status: 'unavailable' } as const

    const json = (await (response as Response).json()) as { account?: { login?: string } }
    return {
      status: 'ok',
      login: json.account?.login ?? null,
    } as const
  } catch {
    return { status: 'unavailable' } as const
  }
}

async function readApiError(response: Response): Promise<Auth.Error> {
  const text = await response.text()
  const json = parseJson(text)
  if (!json || typeof json !== 'object' || !('code' in json) || !('message' in json))
    throw new Error(text || response.statusText || 'Request failed.')

  const error = json as {
    code: string
    message: string
    issues?: Array<{ message: string; path: string }>
  }

  return {
    code: error.code,
    message: formatErrorMessage(error),
  }
}

function readRetryAfterMs(response: Response) {
  const retryAfter = response.headers.get('retry-after')
  if (!retryAfter) return undefined

  const seconds = Number(retryAfter)
  if (!Number.isFinite(seconds)) return undefined
  return Math.max(seconds, 0) * 1000
}

function formatErrorMessage(json: {
  message: string
  issues?: Array<{ message: string; path: string }>
}) {
  if (!Array.isArray(json.issues)) return json.message
  return json.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  throw signal.reason ?? new DOMException('This operation was aborted.', 'AbortError')
}

async function waitForNextPoll(deadline: number, delayMs: number, signal?: AbortSignal) {
  throwIfAborted(signal)

  const remainingMs = deadline - Date.now()
  if (remainingMs <= 0) return false

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(done, Math.min(delayMs, remainingMs))

    function done() {
      signal?.removeEventListener('abort', onAbort)
      resolve(undefined)
    }

    function onAbort() {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      reject(signal?.reason ?? new DOMException('This operation was aborted.', 'AbortError'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })

  throwIfAborted(signal)
  return Date.now() < deadline
}
