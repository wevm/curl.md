/** Key-to-JSON-value mapping for typed KV access. */
type ValueFor<K extends string> =
  | (K extends 'stats:tokens_saved' ? number : never)
  | (K extends `stats:tokens_saved:${string}` ? number : never)
  | (K extends `check:${string}`
      ? { score: number; tokens: number; saved: number }
      : never)
  | (K extends `page:${string}`
      ? { content: string; contentType: string }
      : never)
  | (K extends `query:${string}` ? string : never)
  | (K extends 'cli:latest'
      ? { published_at: string | null; version: string }
      : never)
  | (K extends `ratelimit:${'fetch' | 'query'}:${string}`
      ? { count: number; reset: number }
      : never)
  | (K extends `session:${string}` ? string : never)

export type KVKey =
  | `check:${string}`
  | 'cli:latest'
  | `page:${string}`
  | `query:${string}`
  | `ratelimit:${'fetch' | 'query'}:${string}`
  | `session:${string}`
  | 'stats:tokens_saved'
  | `stats:tokens_saved:${string}`

export interface TypedKV {
  get<K extends KVKey>(key: K, type: 'json'): Promise<ValueFor<K> | null>
  get(key: KVKey): Promise<string | null>
  get(key: KVKey, type: 'text'): Promise<string | null>
  get(key: KVKey, type: 'arrayBuffer'): Promise<ArrayBuffer | null>
  get(key: KVKey, type: 'stream'): Promise<ReadableStream | null>

  put(
    key: KVKey,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      expiration?: number
      expirationTtl?: number
      metadata?: unknown
    },
  ): Promise<void>

  delete(key: KVKey): Promise<void>

  list<Metadata = unknown>(options?: {
    prefix?: string
    limit?: number
    cursor?: string
  }): Promise<{
    keys: { name: KVKey; expiration?: number; metadata?: Metadata }[]
    list_complete: boolean
    cursor?: string
    cacheStatus: string | null
  }>
}
