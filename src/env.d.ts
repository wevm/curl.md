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
    REQUEST_QUEUE: Queue<{
      estimated: boolean
      hostname: string
      id: string
      keywords: string | null
      markdownLength: number
      objective: string | null
      path: string
      tokens_saved: number | null
      url: string
      user_agent: string | undefined
    }>
  }
}
