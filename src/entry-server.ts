import * as Sentry from '@sentry/cloudflare'
import serverEntry from '@tanstack/react-start/server-entry'
import { z } from 'zod'
import { api } from '#api.ts'
import { cleanupExpired } from '#crons/cleanup.ts'
import { createClient } from '#db/client.ts'
import { processRequestMessage } from '#queues/request.ts'
import { processStripeWebhookMessage } from '#queues/stripe-webhook.ts'

export default Sentry.withSentry<Env, QueueHandlerMessage>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.01,
    sendDefaultPii: true,
  }),
  {
    fetch(request, env, ctx) {
      const url = new URL(request.url)
      // Route API requests to the Hono API handler
      if (url.pathname.startsWith('/api/')) return api.fetch(new Request(url, request), env, ctx)
      // Route dot-segment paths (e.g. curl.md/example.com) to the API handler under /api prefix
      const firstSegment = url.pathname.split('/')[1] ?? ''
      if (firstSegment.includes('.') || /^https?:$/.test(firstSegment)) {
        const protocolMatch = url.pathname.match(/^\/(https?:\/\/)(.+)/)
        if (protocolMatch) {
          const accept = request.headers.get('accept') ?? ''
          // Redirect protocol-prefixed paths in browsers (e.g. /https://example.com/path → /example.com/path)
          if (accept.includes('text/html'))
            return new Response(null, {
              status: 301,
              headers: { location: `/${protocolMatch[2]}${url.search}` },
            })
          url.pathname = `/${protocolMatch[2]}`
        }
        url.pathname = `/api${url.pathname}`
        return api.fetch(new Request(url, request), env, ctx)
      }
      // Serve known static assets directly from Workers Assets binding
      const path = url.pathname.replace(/\/+$/, '')
      const staticAssets = {
        '/llms.txt': '/llms.txt',
        '/skills': '/.well-known/skills/index.json',
        '/.well-known/skills': '/.well-known/skills/index.json',
        '/.well-known/skills/curl-md': '/.well-known/skills/curl-md/SKILL.md',
      } as const
      if (path in staticAssets)
        return env.ASSETS.fetch(new URL(staticAssets[path as keyof typeof staticAssets], url))
      // Fall through to TanStack Start SSR handler for all other routes (app pages)
      return serverEntry.fetch(request, { context: { ctx, env, request } })
    },
    async queue(batch, env) {
      if (batch.queue.endsWith('-dlq')) {
        for (const message of batch.messages) {
          const { ack: _, retry: __, ...rest } = message
          console.error(`DLQ message [${batch.queue}]`, rest)
          message.ack()
        }
        return
      }

      const queueName = (() => {
        // Preview queues have a suffix (e.g. `stripe-webhook-pr25`), strip it
        const previewApex = env.HOST.replace('.curl.md', '')
        if (previewApex) return batch.queue.replace(`-${previewApex}`, '')
        return batch.queue
      })()
      const queue = z.parse(
        z.enum([processRequestMessage.queueName, processStripeWebhookMessage.queueName]),
        queueName,
      )
      const handler = {
        [processRequestMessage.queueName]: processRequestMessage,
        [processStripeWebhookMessage.queueName]: processStripeWebhookMessage,
      }[queue]
      const db = createClient(env.DB.connectionString)
      for (const message of batch.messages) {
        try {
          await handler(message as never, db)
          message.ack()
        } catch (error) {
          console.error(`Queue message ${message.id} failed:`, error)
          message.retry()
        }
      }
    },
    scheduled(controller, env, ctx) {
      // TODO: cron union type gen
      // https://github.com/cloudflare/workers-sdk/pull/12740
      const crons = {
        '0 * * * *': cleanupExpired,
      } as const
      const task = crons[controller.cron as keyof typeof crons]
      if (task) ctx.waitUntil(task(env, ctx))
    },
  },
)

type QueueHandlerMessage = processRequestMessage.Body | processStripeWebhookMessage.Body

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: {
        ctx: ExecutionContext
        env: Env
        request: Request
      }
    }
  }
}
