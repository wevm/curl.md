import type { Transport } from './mod.ts'
import { defineTransport } from './mod.ts'

export const cfBrowserRendering = defineTransport<{
  accountId: string
  apiToken: string
}>(async (url, init, context) => {
  if (context.previous?.status !== 403 || !context.options) return null
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
        goToOptions: { waitUntil: 'networkidle2' },
      }),
      signal: init?.signal ? AbortSignal.any([init?.signal, signal]) : signal,
    },
  )
  if (!res.ok) return null
  const content = await res.text()
  if (/error code:\s*\d+/i.test(content)) return null
  return new Response(content, {
    headers: { 'content-type': 'text/html' },
  })
})

export const fetch = defineTransport<
  | {
      headers?: HeadersInit
    }
  | undefined
>((url, init, context) => {
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
