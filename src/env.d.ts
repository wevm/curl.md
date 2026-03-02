declare namespace Cloudflare {
  interface Env {
    KV: KVNamespace<
      | `check:${string}`
      | `page:${string}`
      | `query:${string}`
      | `ratelimit:${string}`
      | `session:${string}`
      | 'stats:tokens_saved'
      | `stats:tokens_saved:${string}`
    >
    TOKEN_ENCRYPTION_KEY: string
    // Adding stronger queue types
    // https://github.com/cloudflare/workers-sdk/issues/7112
    REQUEST_QUEUE: Queue<
      import('#queues/request.ts').processRequestMessage.Body
    >
  }
}
