declare namespace Cloudflare {
  // Adding stronger types to Clouflare.Env
  // https://github.com/cloudflare/workers-sdk/issues/7112
  interface Env {
    KV: import('#lib/kv.ts').TypedKV
    REQUEST_QUEUE: Queue<
      import('#queues/request.ts').processRequestMessage.Body
    >
    STRIPE_WEBHOOK_QUEUE: Queue<
      import('#queues/stripe-webhook.ts').processStripeWebhookMessage.Body
    >
  }
}
