import { defineRule } from '../mod.ts'

export const cloudflare = defineRule({
  key: 'cloudflare',
  patterns: [new URLPattern({ hostname: 'developers.cloudflare.com' })],
  checks: [{ url: 'https://developers.cloudflare.com/workers/', contains: ['Workers'] }],
  rewrite(url) {
    return cloudflareRawCandidates(url)[0]
  },
  async fetch(input, init, { fetch }) {
    let lastResponse = new Response(null, { status: 404 })
    for (const candidate of cloudflareRawCandidates(asUrl(input))) {
      const response = await fetch(candidate, init)
      if (response.ok) return response
      if (response.status !== 404) return response
      lastResponse = response
    }
    return lastResponse
  },
})

function asUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input
  if (input instanceof Request) return new URL(input.url)
  return new URL(input)
}

function cloudflareRawCandidates(url: URL): URL[] {
  const pathname = getCloudflareSourcePathname(url)
  const trimmed = pathname === '/' ? '' : pathname.replace(/\/$/, '')
  const paths = [`${trimmed || '/index'}.mdx`, `${trimmed || '/index'}/index.mdx`]
  return [...new Set(paths)].map(
    (path) =>
      new URL(
        `https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs${path}`,
      ),
  )
}

function getCloudflareSourcePathname(url: URL): string {
  if (url.hostname === 'developers.cloudflare.com') return url.pathname || '/'
  const prefix = '/cloudflare/cloudflare-docs/production/src/content/docs'
  if (url.hostname !== 'raw.githubusercontent.com' || !url.pathname.startsWith(prefix))
    return url.pathname || '/'

  const relative = url.pathname.slice(prefix.length) || '/'
  if (relative === '/index.mdx') return '/'
  if (relative.endsWith('/index.mdx')) return relative.slice(0, -'/index.mdx'.length) || '/'
  if (relative.endsWith('.mdx')) return relative.slice(0, -'.mdx'.length) || '/'
  return relative
}
