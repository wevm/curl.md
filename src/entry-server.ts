import * as Sentry from '@sentry/cloudflare'
import { RouterProvider } from '@tanstack/react-router'
import { renderRouterToStream } from '@tanstack/react-router/ssr/server'
import { jsx } from 'react/jsx-runtime'
import { z } from 'zod'
import { api } from '#api.ts'
import { cleanupExpired } from '#crons/cleanup.ts'
import { createClient } from '#db/client.ts'
import { appendVaryAccept, negotiateAccept } from '#lib/accept.ts'
import { processRequestEnrichmentMessage } from '#queues/request-enrichment.ts'
import { processRequestMessage } from '#queues/request.ts'
import { processStripeWebhookMessage } from '#queues/stripe-webhook.ts'

const staticAssets = {
  '/llms.txt': '/llms.txt',
  '/skills': '/.well-known/skills/index.json',
  '/.well-known/skills': '/.well-known/skills/index.json',
  '/.well-known/skills/curl-md': '/.well-known/skills/curl-md/SKILL.md',
} as const

export default Sentry.withSentry<Env, QueueHandlerMessage>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    environment: __ENV__,
    release: __GIT_SHA__,
    sendDefaultPii: true,
    tracesSampleRate: 0.01,
  }),
  {
    async fetch(request, env, ctx) {
      const url = new URL(request.url)

      // Route API requests to the Hono API handler
      if (url.pathname.startsWith('/api/')) return api.fetch(new Request(url, request), env, ctx)

      // Serve known static assets directly from Workers Assets binding
      const path = url.pathname.replace(/\/+$/, '')
      if (path in staticAssets)
        return env.ASSETS.fetch(new URL(staticAssets[path as keyof typeof staticAssets], url))

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

      // Redirect docs requests to lowercase canonical paths, but preserve case for other routes.
      const lowercasePathname = url.pathname.toLowerCase()
      if (
        url.pathname !== lowercasePathname &&
        (lowercasePathname === '/docs' || lowercasePathname.startsWith('/docs/'))
      )
        return new Response(null, {
          status: 301,
          headers: { location: `${lowercasePathname}${url.search}` },
        })

      // Handle docs .md endpoints
      const docsPathname = (() => {
        if (url.pathname === '/docs' || url.pathname === '/docs/') return '/docs/index.md'
        if (!url.pathname.startsWith('/docs/')) return
        if (url.pathname.endsWith('.txt')) return
        const normalizedPathname = url.pathname.replace(/\/+$/, '')
        if (normalizedPathname.endsWith('.md')) return normalizedPathname
        return `${normalizedPathname}.md`
      })()
      const docsAcceptType = (() => {
        if (url.pathname.endsWith('.md')) return 'markdown'
        return negotiateAccept(request.headers.get('accept'), (acceptedValue) => {
          if (acceptedValue.q <= 0) return null
          if (acceptedValue.type === '*' && acceptedValue.subtype === '*') return 'html' as const
          if (acceptedValue.type === 'text' && acceptedValue.subtype === '*') return 'html' as const
          if (acceptedValue.type === 'text' && acceptedValue.subtype === 'html')
            return 'html' as const
          if (acceptedValue.type === 'text' && acceptedValue.subtype === 'markdown')
            return 'markdown' as const
          return null
        })
      })()
      if (docsPathname)
        switch (docsAcceptType) {
          case 'markdown': {
            const docsMarkdownUrl = new URL(docsPathname, url)
            docsMarkdownUrl.search = url.search
            const response = env.ASSETS.fetch(new Request(docsMarkdownUrl, request))
            if (!url.pathname.endsWith('.md')) return appendVaryAccept(await response)
            return response
          }
          case null:
            return new Response('Not Acceptable', {
              status: 406,
              headers: { vary: 'Accept' },
            })
        }

      // Validate pathname
      try {
        decodeURI(url.pathname)
      } catch {
        return new Response('Bad Request', { status: 400 })
      }

      // Fall through to TanStack Start SSR handler for all other routes (app pages)
      const response = (await getStartHandler())(request, { context: { ctx, env, request } })
      if (docsAcceptType === 'html') return appendVaryAccept(await response)
      return response
    },
    async queue(batch, env) {
      const queueName = (() => {
        // Preview queues have a suffix (e.g. `stripe-webhook-pr25`), strip it
        const previewApex = env.HOST.replace('.curl.md', '')
        if (previewApex) return batch.queue.replace(`-${previewApex}`, '')
        return batch.queue
      })()
      const queue = z.parse(
        z.enum([
          processRequestEnrichmentMessage.queueName,
          processRequestMessage.queueName,
          processStripeWebhookMessage.queueName,
        ]),
        queueName,
      )
      const handler = {
        [processRequestEnrichmentMessage.queueName]: processRequestEnrichmentMessage,
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
          // Emit alert when next retry will move the message into DLQ
          if (message.attempts >= 3)
            Sentry.captureException(error, {
              extra: {
                queue: {
                  attempts: message.attempts,
                  batch_queue: batch.queue,
                  body: message.body,
                  logical_queue: queueName,
                  message_id: message.id,
                },
              },
              tags: { queue: queueName, queue_outcome: 'dead_letter' },
            })
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

type QueueHandlerMessage =
  | processRequestEnrichmentMessage.Body
  | processRequestMessage.Body
  | processStripeWebhookMessage.Body

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

// TODO: Runtime import HMR workaround
// https://github.com/TanStack/router/issues/7285
let cachedStartHandler: Awaited<ReturnType<typeof buildStartHandler>> | null = null
if (import.meta.hot)
  import.meta.hot.accept(() => {
    cachedStartHandler = null
  })

async function getStartHandler() {
  if (cachedStartHandler) return cachedStartHandler
  cachedStartHandler = await buildStartHandler()
  return cachedStartHandler
}

async function buildStartHandler() {
  const mod = await import('@tanstack/react-start/server')
  return mod.createStartHandler(({ request, responseHeaders, router }) =>
    renderRouterToStream({
      request,
      responseHeaders,
      router,
      children: jsx(RouterProvider, { router }),
    }),
  )
}
