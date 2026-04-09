// oxlint-disable-next-line typescript-eslint/triple-slash-reference -- ambient worker shims for published type output
/// <reference path="./cf-env.d.ts" />

import { hc } from 'hono/client'
import type { api } from '../../src/api.ts'

export const baseUrl = 'https://curl.md'
export const defaultBaseUrl = baseUrl

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
export function createClient(url: string = baseUrl, options?: Parameters<typeof hc>[1]) {
  const client = hc<typeof api>(url, options)

  type Fetch = (typeof client.api)[':url{.+}']['$get']
  type FetchQuery = Pick<
    NonNullable<NonNullable<Parameters<Fetch>[0]>['query']>,
    'fresh' | 'keywords' | 'mode' | 'objective'
  >
  type FetchOptions = Partial<Omit<FetchQuery, 'fresh' | 'keywords'>> & {
    fresh?: boolean | undefined
    keywords?: string[] | undefined
    options?: NonNullable<Parameters<Fetch>[1]> | undefined
  }

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'fetch') {
        return (targetUrl: string, fetchOptions?: FetchOptions | undefined) => {
          const { options, ...queryOptions } = fetchOptions ?? {}
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
            options,
          )
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as typeof client & {
    fetch: (url: string, options?: FetchOptions) => ReturnType<Fetch>
  }
}

export type Client = ReturnType<typeof createClient>
