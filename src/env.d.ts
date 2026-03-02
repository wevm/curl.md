declare namespace Cloudflare {
  interface Env {
    KV: import('#lib/kv.ts').TypedKV
    TOKEN_ENCRYPTION_KEY: string
    // Adding stronger queue types
    // https://github.com/cloudflare/workers-sdk/issues/7112
    REQUEST_QUEUE: Queue<
      import('#queues/request.ts').processRequestMessage.Body
    >
  }
}
