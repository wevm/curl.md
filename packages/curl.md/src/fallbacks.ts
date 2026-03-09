import { defineFallback } from './mod.ts'

export const browserUA = defineFallback((url, init, context) => {
  if (context.response.status !== 403) return Promise.resolve(null)
  return context.fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
  })
})

export const cfBrowserRendering = defineFallback<{
  accountId: string
  apiToken: string
}>(async (url, _init, context) => {
  if (context.response.status !== 403 || !context.options) return null
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
      }),
    },
  )
  if (!res.ok) return null
  const content = await res.text()
  if (/error code:\s*\d+/i.test(content)) return null
  return new Response(content, {
    headers: { 'content-type': 'text/html' },
  })
})
