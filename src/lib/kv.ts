/** Key-to-JSON-value mapping for typed KV access. */
export namespace KV {
  export type Value<K extends string> =
    | (K extends `balance:${string}` ? number : never)
    | (K extends 'stats:tokens_saved' ? number : never)
    | (K extends `stats:tokens_saved:${string}` ? number : never)
    | (K extends `page:${string}` ? { content: string; type: string } : never)
    | (K extends `query:${string}` ? string : never)
    | (K extends 'cli:latest'
        ? { published_at: string | null; version: string }
        : never)
    | (K extends `ratelimit:${'fetch' | 'query'}:${string}`
        ? { count: number; reset: number }
        : never)
    | (K extends `session:${string}` ? string : never)

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
  get<K extends KV.Key>(key: K, type: 'json'): Promise<KV.Value<K> | null>
  get(key: KV.Key): Promise<string | null>
  get(key: KV.Key, type: 'text'): Promise<string | null>
  get(key: KV.Key, type: 'arrayBuffer'): Promise<ArrayBuffer | null>
  get(key: KV.Key, type: 'stream'): Promise<ReadableStream | null>

  put<K extends KV.Key>(
    key: K,
    value:
      | KV.Value<K>
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

  list<Metadata = unknown>(options?: {
    prefix?: string
    limit?: number
    cursor?: string
  }): Promise<{
    keys: { name: KV.Key; expiration?: number; metadata?: Metadata }[]
    list_complete: boolean
    cursor?: string
    cacheStatus: string | null
  }>
}
