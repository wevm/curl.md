import { z } from 'zod/mini'
import type { Transport } from './mod.ts'
import { defineTransport } from './mod.ts'

export const cfBrowserRendering = defineTransport<{
  accountId: string
  apiToken: string
}>(async (url, init, context) => {
  if ((!context.render && context.previous?.status !== 403) || !context.options) return null
  const signal = AbortSignal.timeout(20_000)
  const res = await context.fetch(
    `https://api.cloudflare.com/client/v4/accounts/${context.options.accountId}/browser-rendering/content`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.options.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url.toString(),
        rejectResourceTypes: ['font', 'image', 'media'],
        gotoOptions: { waitUntil: 'networkidle2' },
      }),
      signal: init?.signal ? AbortSignal.any([init?.signal, signal]) : signal,
    },
  )
  if (!res.ok) return null
  const content = await (async () => {
    const content = await res.text()
    const contentType = res.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.includes('application/json')) return content

    try {
      return z.parse(
        z.object({
          result: z.string(),
          success: z.literal(true),
        }),
        JSON.parse(content),
      ).result
    } catch {
      return null
    }
  })()
  if (content === null) return null
  if (/error code:\s*\d+/i.test(content)) return null
  // The rendered HTML is a string now, so its original `<meta charset>` no longer applies.
  return new Response(content, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
})

export const fetch = defineTransport<
  | {
      headers?: HeadersInit
    }
  | undefined
>(async (url, init, context) => {
  if (context.render) return null
  return context.fetch(url, {
    ...init,
    ...(context.options && {
      headers: { ...init?.headers, ...context.options.headers },
    }),
    redirect: init?.redirect ?? 'follow',
  })
})

export function fallback(transports: Transport[]): Transport {
  return async (url, init, context) => {
    let previous: Response | undefined = context.previous
    for (const transport of transports) {
      const result = await transport(url, init, { ...context, previous })
      if (result) {
        if (result.ok) return result
        previous = result
      }
    }
    return previous ?? null
  }
}
