/** Key-to-JSON-value mapping for typed KV access. */
export namespace KV {
  export type Value<key extends string> =
    | (key extends `balance:${string}` ? number : never)
    | (key extends 'stats:tokens_saved' ? number : never)
    | (key extends `stats:tokens_saved:${string}` ? number : never)
    | (key extends `page:${string}`
        ? { content: string; meta: Record<string, unknown> }
        : never)
    | (key extends `query:${string}` ? string : never)
    | (key extends 'cli:latest'
        ? { published_at: string | null; version: string }
        : never)
    | (key extends `ratelimit:${'fetch' | 'query'}:${string}`
        ? { count: number; reset: number }
        : never)
    | (key extends `session:${string}` ? string : never)

  export type Key =
    | `balance:${string}`
    | 'cli:latest'
    | `page:${string}`
    | `query:${string}`
    | `ratelimit:${'fetch' | 'query'}:${string}`
    | `session:${string}`
    | 'stats:tokens_saved'
    | `stats:tokens_saved:${string}`
}

export interface TypedKV {
  get<key extends KV.Key>(key: key, type: 'json'): Promise<KV.Value<key> | null>
  get(key: KV.Key): Promise<string | null>
  get(key: KV.Key, type: 'text'): Promise<string | null>
  get(key: KV.Key, type: 'arrayBuffer'): Promise<ArrayBuffer | null>
  get(key: KV.Key, type: 'stream'): Promise<ReadableStream | null>

  put<key extends KV.Key>(
    key: key,
    value:
      | KV.Value<key>
      | string
      | ArrayBuffer
      | ArrayBufferView
      | ReadableStream,
    options?: {
      expiration?: number
      expirationTtl?: number
      metadata?: unknown
    },
  ): Promise<void>

  delete(key: KV.Key): Promise<void>

  list<metadata = unknown>(options?: {
    prefix?: string
    limit?: number
    cursor?: string
  }): Promise<{
    keys: { name: KV.Key; expiration?: number; metadata?: metadata }[]
    list_complete: boolean
    cursor?: string
    cacheStatus: string | null
  }>
}
