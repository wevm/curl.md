declare namespace Cloudflare {
  interface Env {
    KV: import('#lib/kv.ts').TypedKV
    SENTRY_DSN: string
    STRIPE_SECRET_KEY: string
    STRIPE_WEBHOOK_SECRET: string
    TOKEN_ENCRYPTION_KEY: string
    // Adding stronger queue types
    // https://github.com/cloudflare/workers-sdk/issues/7112
    REQUEST_QUEUE: Queue<
      import('#queues/request.ts').processRequestMessage.Body
    >
    STRIPE_WEBHOOK_QUEUE: Queue<
      import('#queues/stripe-webhook.ts').processStripeWebhookMessage.Body
    >
  }
}
