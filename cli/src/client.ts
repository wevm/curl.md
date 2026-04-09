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
 * const res = await client.fetch.$get({
 *   param: { url: encodeURIComponent('https://example.com') },
 * })
 * ```
 */
export function createClient(url: string = baseUrl, options?: Parameters<typeof hc>[1]) {
  const client = hc<typeof api>(url, options)
  return Object.assign(client, {
    fetch: client.api[':url{.+}'].$get,
  })
}

export type Client = ReturnType<typeof createClient>
