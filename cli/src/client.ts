// oxlint-disable-next-line typescript-eslint/triple-slash-reference -- ambient worker shims for published type output
/// <reference path="./cf-env.d.ts" />

import { hc, type ClientRequestOptions } from 'hono/client'
import type { api } from '../../src/api.ts'

export const defaultBaseUrl = 'https://curl.md'

/**
 * Create a typed client for the `curl.md` API.
 *
 * @example
 * ```ts
 * import { createClient } from 'curl.md'
 *
 * const client = createClient()
 * const res = await client.fetch('example.com')
 * ```
 */
export function createClient(
  url: string = defaultBaseUrl,
  options?: ClientRequestOptions & {
    aiAgent?: AiAgent | undefined
  },
): Client {
  const aiAgent = (() => {
    if (options && Object.prototype.hasOwnProperty.call(options, 'aiAgent'))
      return normalizeAiAgent(options.aiAgent)
    return normalizeAiAgent(detectAgent().name)
  })()

  const client = hc<typeof api>(url, {
    ...options,
    headers: getHeaders(options?.headers, undefined, { aiAgent }),
  })

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'fetch') {
        return (targetUrl: string, fetchOptions?: FetchOptions | undefined) => {
          const normalizedTargetURL = normalizeTargetURL(targetUrl)
          const { options: requestOptions, token, ...queryOptions } = fetchOptions ?? {}
          const query = {
            anchor: normalizedTargetURL.anchor,
            ...queryOptions,
            fresh: queryOptions.fresh ? '' : undefined,
            keywords: queryOptions.keywords?.join(','),
          } satisfies FetchQuery & {
            anchor?: string | undefined
          }

          const clientRequestOptions = (() => {
            if (!requestOptions && !token) return undefined
            return {
              ...requestOptions,
              headers: getHeaders(options?.headers, requestOptions?.headers, { aiAgent, token }),
            }
          })()

          return target.api[':url{.+}'].$get(
            {
              param: { url: normalizedTargetURL.url },
              query,
            },
            clientRequestOptions,
          )
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as unknown as Client
}

export type Client = Omit<RpcClient, 'api'> & {
  api: PublicApi
  fetch: (url: string, options?: FetchOptions) => ReturnType<Fetch>
}

type RpcClient = ReturnType<typeof hc<typeof api>>
type Api = RpcClient['api']
type PublicApi = Omit<Api, 'og.png' | 'sentry' | 'stats' | 'stripe'>
type Fetch = RpcClient['api'][':url{.+}']['$get']
type FetchQuery = Pick<
  NonNullable<NonNullable<Parameters<Fetch>[0]>['query']>,
  'fresh' | 'keywords' | 'mode' | 'objective'
>
type FetchOptions = Partial<Omit<FetchQuery, 'fresh' | 'keywords'>> & {
  fresh?: boolean | undefined
  keywords?: string[] | undefined
  options?: NonNullable<Parameters<Fetch>[1]> | undefined
  token?: string | undefined
}

function getHeaders(
  baseHeaders: ClientRequestOptions['headers'],
  requestHeaders: ClientRequestOptions['headers'],
  opts: {
    aiAgent?: AiAgent | undefined
    token?: string | undefined
  },
): ClientRequestOptions['headers'] {
  if (typeof baseHeaders === 'function' || typeof requestHeaders === 'function')
    return async () => {
      const nextBaseHeaders = typeof baseHeaders === 'function' ? await baseHeaders() : baseHeaders
      const nextRequestHeaders =
        typeof requestHeaders === 'function' ? await requestHeaders() : requestHeaders
      return mergeHeaders(nextBaseHeaders, nextRequestHeaders, opts) || {}
    }
  return mergeHeaders(baseHeaders, requestHeaders, opts)
}

function mergeHeaders(
  baseHeaders: Record<string, string> | undefined,
  requestHeaders: Record<string, string> | undefined,
  opts: {
    aiAgent?: AiAgent | undefined
    token?: string | undefined
  },
) {
  if (!baseHeaders && !requestHeaders && !opts.aiAgent && !opts.token) return undefined
  const nextHeaders = new Headers(baseHeaders)
  if (requestHeaders)
    for (const [name, value] of Object.entries(requestHeaders)) nextHeaders.set(name, value)
  nextHeaders.delete('x-ai-agent')
  if (opts.aiAgent) nextHeaders.set('x-ai-agent', opts.aiAgent)
  if (opts.token) nextHeaders.set('Authorization', `Bearer ${opts.token}`)
  return Object.fromEntries(nextHeaders.entries())
}

const aiAgents = ['amp', 'claude', 'codex', 'cursor', 'gemini', 'opencode', 'pi'] as const
type AiAgent = (typeof aiAgents)[number]

function normalizeAiAgent(value: unknown): AiAgent | undefined {
  if (typeof value !== 'string') return undefined

  const normalizedValue = value.toLowerCase()
  if (!aiAgents.includes(normalizedValue as AiAgent)) return undefined
  return normalizedValue as AiAgent
}

/**
 * Vendored from std-env v4.1.0 — agent detection subset
 * https://github.com/unjs/std-env
 * MIT License
 */
function detectAgent(): { name?: string } {
  const env = globalThis.process?.env || Object.create(null)
  const aiAgent = env.AI_AGENT
  if (aiAgent) return { name: aiAgent.toLowerCase() }

  const rules: Array<[string, (string | (() => boolean))[]]> = [
    ['amp', [() => env.AGENT === 'amp']],
    ['claude', ['CLAUDECODE', 'CLAUDE_CODE']],
    ['codex', ['CODEX_SANDBOX', 'CODEX_THREAD_ID']],
    ['cursor', ['CURSOR_AGENT']],
    ['gemini', ['GEMINI_CLI']],
    ['opencode', ['OPENCODE']],
    ['pi', [() => /\.pi[\\/]agent/.test(env.PATH ?? '')]],
  ]
  for (const [name, checks] of rules) {
    for (const check of checks)
      if (typeof check === 'string' ? env[check] : check()) return { name }
  }
  return {}
}

function normalizeTargetURL(targetUrl: string) {
  const hashIndex = targetUrl.indexOf('#')
  const url = hashIndex === -1 ? targetUrl : targetUrl.slice(0, hashIndex)
  const searchIndex = url.indexOf('?')
  const encodedUrl =
    searchIndex === -1
      ? url
      : `${url.slice(0, searchIndex)}${encodeURIComponent(url.slice(searchIndex))}`
  if (hashIndex === -1) return { anchor: undefined, url: encodedUrl }

  const anchor = targetUrl.slice(hashIndex + 1) || undefined
  return { anchor, url: encodedUrl }
}
