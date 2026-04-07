declare namespace Cloudflare {
  // Adding stronger types to Clouflare.Env
  // https://github.com/cloudflare/workers-sdk/issues/7112
  interface Env {
    CLOUDFLARE_ACCOUNT_ID: string
    CLOUDFLARE_API_TOKEN: string
    KV: KV
    REQUEST_QUEUE: Queue<import('#queues/request.ts').processRequestMessage.Body>
    STRIPE_PUBLISHABLE_KEY: string
    STRIPE_WEBHOOK_QUEUE: Queue<
      import('#queues/stripe-webhook.ts').processStripeWebhookMessage.Body
    >
  }
}

/** Key-to-JSON-value mapping for typed KV access. */
declare namespace KV {
  type Value<key extends string> =
    | (key extends `balance:${string}` ? number : never)
    | (key extends 'stats:tokens_saved' ? number : never)
    | (key extends `stats:tokens_saved:${string}` ? number : never)
    | (key extends `page:${string}` ? { content: string; meta: Record<string, unknown> } : never)
    | (key extends `query:${string}` ? string : never)
    | (key extends 'cli:latest' ? { published_at: string | null; version: string } : never)
    | (key extends `ratelimit:${string}` ? { count: number; reset: number } : never)
    | (key extends `payment:${string}`
        ? {
            amount: number
            cs_secret: string | null
            has_saved_payment_methods: boolean
            locked: boolean
            pi_secret: string
            saved_payment_methods_unavailable: boolean
          }
        : never)
    | (key extends `session:${string}` ? string : never)

  type Key =
    | `balance:${string}`
    | 'cli:latest'
    | `page:${string}`
    | `payment:${string}`
    | `query:${string}`
    | `ratelimit:${string}`
    | `session:${string}`
    | 'stats:tokens_saved'
    | `stats:tokens_saved:${string}`
}

interface KV {
  get<key extends KV.Key>(key: key, type: 'json'): Promise<KV.Value<key> | null>
  get(key: KV.Key): Promise<string | null>
  get(key: KV.Key, type: 'text'): Promise<string | null>
  get(key: KV.Key, type: 'arrayBuffer'): Promise<ArrayBuffer | null>
  get(key: KV.Key, type: 'stream'): Promise<ReadableStream | null>

  put<key extends KV.Key>(
    key: key,
    value: KV.Value<key> | string | ArrayBuffer | ArrayBufferView | ReadableStream,
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
