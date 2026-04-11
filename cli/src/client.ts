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
export function createClient(url: string = defaultBaseUrl, options?: ClientRequestOptions): Client {
  const client = hc<typeof api>(url, options)

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'fetch') {
        return (targetUrl: string, fetchOptions?: FetchOptions | undefined) => {
          const { options, token, ...queryOptions } = fetchOptions ?? {}
          const query = {
            ...queryOptions,
            fresh: queryOptions.fresh ? '' : undefined,
            keywords: queryOptions.keywords?.join(','),
          } satisfies FetchQuery

          return target.api[':url{.+}'].$get(
            {
              param: { url: targetUrl },
              query,
            },
            token ? withAuthorizationHeader(options, token) : options,
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

function withAuthorizationHeader(
  options: NonNullable<Parameters<Fetch>[1]> | undefined,
  token: string,
): NonNullable<Parameters<Fetch>[1]> {
  const headers = options?.headers
  return {
    ...options,
    headers:
      typeof headers === 'function'
        ? async () => withTokenHeader(await headers(), token)
        : withTokenHeader(headers, token),
  }
}

function withTokenHeader(headers: Record<string, string> | undefined, token: string) {
  const nextHeaders = { ...headers }
  for (const key of Object.keys(nextHeaders)) {
    if (key.toLowerCase() !== 'authorization') continue
    delete nextHeaders[key]
  }
  nextHeaders.Authorization = `Bearer ${token}`
  return nextHeaders
}
