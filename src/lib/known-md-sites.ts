/** Map of hostname → transform to get the markdown URL. */
export const knownMdSites = new Map<
  string,
  (url: URL) => MdUrlResult | URL | undefined
>([
  ['bun.sh', prefixedWithIndex('/docs')],
  ['code.claude.com', appendMd],
  ['developers.cloudflare.com', appendIndexMd],
  ['docs.github.com', githubDocsArticle],
  ['docs.openclaw.ai', appendMdWithIndex],
  ['developers.openai.com', appendMd],
  ['docs.anthropic.com', appendMd],
  ['docs.astral.sh', appendMdWithIndex],
  ['docs.deno.com', githubRepo('denoland/docs')],
  ['docs.stripe.com', appendMd],
  ['docs.tempo.xyz', appendMdWithIndex],
  ['github.com', githubRaw],
  ['hono.dev', githubRepo('honojs/website')],
  ['laravel.com', prefixedWithIndex('/docs')],
  ['nextjs.org', prefixedWithIndex('/docs')],
  ['nodejs.org', prefixedWithIndex('/docs')],
  ['planetscale.com', prefixedWithIndex('/docs')],
  ['react.dev', reactDev],
  ['render.com', prefixedWithIndex('/docs')],
  ['rolldown.rs', appendMd],
  ['router.vuejs.org', appendMd],
  ['rspack.rs', appendMdWithIndex],
  ['tanstack.com', appendMd],
  ['turbo.build', appendMd],
  ['ui.shadcn.com', appendMd],
  ['vercel.com', prefixedWithIndex('/docs')],
  ['viem.sh', appendMdWithIndex],
  ['vitejs.dev', appendMd],
  ['vitest.dev', appendMd],
  ['vuejs.org', appendMd],
  ['wagmi.sh', appendMdWithIndex],
])

export type MdUrlResult = {
  url: URL
  /** Extract markdown from the response body. If omitted, the raw text is used. */
  parse?: (content: string) => {
    markdown: string
    meta?: Record<string, unknown>
  }
}

/** If the URL matches a known site, return the markdown URL and optional parser. */
export function toMdUrl(url: URL): MdUrlResult | undefined {
  const result = knownMdSites.get(url.hostname)?.(url)
  if (!result) return
  if (result instanceof URL) return { url: result }
  return result
}

function appendMd(url: URL): URL {
  const mdUrl = new URL(url.href)
  mdUrl.pathname = `${mdUrl.pathname}.md`
  return mdUrl
}

function appendIndexMd(url: URL): URL {
  const mdUrl = new URL(url.href)
  const base = mdUrl.pathname.endsWith('/')
    ? mdUrl.pathname
    : `${mdUrl.pathname}/`
  mdUrl.pathname = `${base}index.md`
  return mdUrl
}

function appendMdWithIndex(url: URL): URL {
  const mdUrl = new URL(url.href)
  mdUrl.pathname = url.pathname.endsWith('/')
    ? `${mdUrl.pathname}index.md`
    : `${mdUrl.pathname}.md`
  return mdUrl
}

const githubDocsLangs = new Set([
  'cn',
  'de',
  'en',
  'es',
  'fr',
  'ja',
  'ko',
  'pt',
  'ru',
  'zh',
])

function githubDocsArticle(url: URL): MdUrlResult {
  const mdUrl = new URL(url.href)
  mdUrl.pathname = '/api/article'
  const firstSegment = url.pathname.split('/')[1]
  const pathname =
    firstSegment && githubDocsLangs.has(firstSegment)
      ? url.pathname
      : `/en${url.pathname}`
  mdUrl.searchParams.set('pathname', pathname)
  return {
    url: mdUrl,
    parse: (content) => {
      const json = JSON.parse(content)
      return {
        markdown: typeof json.body === 'string' ? json.body : content,
        meta: json.meta,
      }
    },
  }
}

function githubRaw(url: URL): URL | undefined {
  const match = url.pathname.match(/^\/([^/]+\/[^/]+)\/blob\/(.+)/)
  if (!match) return
  return new URL(`https://raw.githubusercontent.com/${match[1]}/${match[2]}`)
}

function githubRepo(
  repo: string,
  opts?: { branch?: string; prefix?: string },
): (url: URL) => URL | undefined {
  const branch = opts?.branch ?? 'main'
  const prefix = opts?.prefix
  return (url) => {
    if (url.pathname === '/' || url.pathname === '') return
    return new URL(
      `https://raw.githubusercontent.com/${repo}/${branch}${prefix ? `/${prefix}` : ''}${url.pathname}.md`,
    )
  }
}

function reactDev(url: URL): URL | undefined {
  if (url.pathname === '/' || url.pathname === '') return
  return appendMd(url)
}

function prefixedWithIndex(prefix: string): (url: URL) => URL | undefined {
  return (url) => {
    if (!url.pathname.startsWith(`${prefix}/`) && url.pathname !== prefix)
      return
    if (url.pathname === prefix || url.pathname === `${prefix}/`) {
      const mdUrl = new URL(url.href)
      mdUrl.pathname = `${prefix}/index.md`
      return mdUrl
    }
    return appendMd(url)
  }
}
