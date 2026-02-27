import handler from '@tanstack/react-start/server-entry'
import { z } from 'zod'
import { api } from '#api.ts'
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
    return handler.fetch(request, { context: { ctx, env, request } })
  },
  queue: async (batch) => {
    const queue = z.enum(['curl-request']).parse(batch.queue)
    const handler = (() => {
      if (queue === 'curl-request') return processRequestMessage
      throw new Error(`No handler for ${queue}`)
    })()
    for (const message of batch.messages) {
      try {
        await handler(message as never)
        message.ack()
      } catch {
        message.retry()
      }
    }
  },
} satisfies ExportedHandler<Env, Parameters<Env['REQUEST_QUEUE']['send']>[0]>

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
