// oxlint-disable-next-line typescript-eslint/triple-slash-reference -- ambient worker shims for published type output
/// <reference path="./cf-env.d.ts" />

import { hc } from 'hono/client'
import type { api } from '../../src/api.ts'

export const defaultBaseUrl = 'https://curl.md'

export type Client = ReturnType<typeof createClient>

/**
 * Create a typed client for the `curl.md` API.
 *
 * @example
 * ```ts
 * import { createClient } from 'curl.md'
 *
 * const client = createClient()
 * const res = await client.api[':url{.+}'].$get({
 *   param: { url: encodeURIComponent('https://example.com') },
 * })
 * ```
 */
export function createClient(baseUrl: string = defaultBaseUrl, options?: Parameters<typeof hc>[1]) {
  return hc<typeof api>(baseUrl, options)
}
