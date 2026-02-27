declare namespace Cloudflare {
  interface Env {
    KV: KVNamespace<
      | `page:${string}`
      | `query:${string}`
      | `ratelimit:${string}`
      | `session:${string}`
      | 'stats:tokens_saved'
      | `stats:tokens_saved:${string}`
    >
    // Adding stronger queue types
    // https://github.com/cloudflare/workers-sdk/issues/7112
    REQUEST_QUEUE: Queue<
      import('#queues/request.ts').processRequestMessage.Body
    >
  }
}
