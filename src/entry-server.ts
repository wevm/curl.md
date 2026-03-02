import serverEntry from '@tanstack/react-start/server-entry'
import { z } from 'zod'
import { api } from '#api.ts'
import { getDb } from '#lib/db.ts'
import { processRequestMessage } from '#queues/request.ts'

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url)
    // Route API requests to the Hono API handler
    if (url.pathname.startsWith('/api/'))
      return api.fetch(new Request(url, request), env, ctx)
    // Route dot-segment paths (e.g. curl.md/example.com) to the API handler under /api prefix
    const firstSegment = url.pathname.split('/')[1] ?? ''
    if (firstSegment.includes('.')) {
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
      return env.ASSETS.fetch(
        new URL(staticAssets[path as keyof typeof staticAssets], url),
      )
    // Fall through to TanStack Start SSR handler for all other routes (app pages)
    return serverEntry.fetch(request, { context: { ctx, env, request } })
  },
  queue: async (batch, env) => {
    const queue = z.enum([processRequestMessage.queueName]).parse(batch.queue)
    const handlers = {
      [processRequestMessage.queueName]: processRequestMessage,
    }
    const handler = handlers[queue]
    const db = getDb(env.DB.connectionString)
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
  // TODO: Add scheduled handler to clean up expired device codes and sessions
  // scheduled: async (event, env, ctx) => { ... }
} satisfies ExportedHandler<Env, processRequestMessage.Body>

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
