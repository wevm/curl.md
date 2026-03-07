export type Rule = {
  resolve?: (
    url: URL,
  ) => URL | { url: URL; headers?: Record<string, string> } | undefined
  parse?: (
    response: Response,
  ) => Promise<{ markdown: string; meta?: Record<string, string> }>
}

export function defineRule(rule: Rule | ((url: URL) => URL | undefined)): Rule {
  if (typeof rule === 'function') return { resolve: rule }
  return rule
}

// ---------------------------------------------------------------------------
// Internal URL transform helpers
// ---------------------------------------------------------------------------

function appendMdUrl(url: URL): URL {
  const mdUrl = new URL(url.href)
  mdUrl.pathname = `${mdUrl.pathname}.md`
  return mdUrl
}

function appendIndexMdUrl(url: URL): URL {
  const mdUrl = new URL(url.href)
  const base = mdUrl.pathname.endsWith('/')
    ? mdUrl.pathname
    : `${mdUrl.pathname}/`
  mdUrl.pathname = `${base}index.md`
  return mdUrl
}

function appendMdWithIndexUrl(url: URL): URL {
  const mdUrl = new URL(url.href)
  mdUrl.pathname = url.pathname.endsWith('/')
    ? `${mdUrl.pathname}index.md`
    : `${mdUrl.pathname}.md`
  return mdUrl
}

// ---------------------------------------------------------------------------
// Reusable strategy rules
// ---------------------------------------------------------------------------

export const appendMd: Rule = { resolve: appendMdUrl }

export const appendIndexMd: Rule = { resolve: appendIndexMdUrl }

export const appendMdWithIndex: Rule = { resolve: appendMdWithIndexUrl }

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function githubRepo(
  repo: string,
  opts?: { branch?: string; prefix?: string },
): Rule {
  const branch = opts?.branch ?? 'main'
  const prefix = opts?.prefix
  return {
    resolve: (url) => {
      if (url.pathname === '/' || url.pathname === '') return
      return new URL(
        `https://raw.githubusercontent.com/${repo}/${branch}${prefix ? `/${prefix}` : ''}${url.pathname}.md`,
      )
    },
  }
}

export function prefixedWithIndex(prefix: string): Rule {
  return {
    resolve: (url) => {
      if (!url.pathname.startsWith(`${prefix}/`) && url.pathname !== prefix)
        return
      if (url.pathname === prefix || url.pathname === `${prefix}/`) {
        const mdUrl = new URL(url.href)
        mdUrl.pathname = `${prefix}/index.md`
        return mdUrl
      }
      return appendMdUrl(url)
    },
  }
}

// ---------------------------------------------------------------------------
// Site-specific rules
// ---------------------------------------------------------------------------

export const github: Rule = {
  resolve: (url) => {
    const match = url.pathname.match(/^\/([^/]+\/[^/]+)\/blob\/(.+)/)
    if (!match) return
    if (!/\.mdx?$/.test(match[2])) return
    return new URL(`https://raw.githubusercontent.com/${match[1]}/${match[2]}`)
  },
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

export const githubDocs: Rule = {
  resolve: (url) => {
    const mdUrl = new URL(url.href)
    mdUrl.pathname = '/api/article'
    const firstSegment = url.pathname.split('/')[1]
    const pathname =
      firstSegment && githubDocsLangs.has(firstSegment)
        ? url.pathname
        : `/en${url.pathname}`
    mdUrl.searchParams.set('pathname', pathname)
    return mdUrl
  },
  parse: async (response) => {
    const json = (await response.json()) as {
      body?: string
      meta?: Record<string, string>
    }
    return {
      markdown:
        typeof json.body === 'string' ? json.body : JSON.stringify(json),
      meta: json.meta,
    }
  },
}

export const aiSdk: Rule = appendMd
export const anthropic: Rule = appendMd
export const astral: Rule = appendMdWithIndex
export const claudeCode: Rule = appendMd
export const cloudflare: Rule = appendIndexMd
export const deno: Rule = githubRepo('denoland/docs')
export const hono: Rule = githubRepo('honojs/website')
export const openclaw: Rule = appendMdWithIndex
export const openai: Rule = appendMd
export const rolldown: Rule = appendMd
export const routerVue: Rule = appendMd
export const rspack: Rule = appendMdWithIndex
export const shadcn: Rule = appendMd
export const stripe: Rule = appendMd
export const tanstack: Rule = appendMd
export const tempo: Rule = appendMdWithIndex
export const turbo: Rule = appendMd
export const viem: Rule = appendMdWithIndex
export const vite: Rule = appendMd
export const vitest: Rule = appendMd
export const vue: Rule = appendMd
export const wagmi: Rule = appendMdWithIndex

export const reactDev: Rule = {
  resolve: (url) => {
    if (url.pathname === '/' || url.pathname === '') return
    return appendMdUrl(url)
  },
}

export const bun: Rule = prefixedWithIndex('/docs')
export const laravel: Rule = prefixedWithIndex('/docs')
export const nextjs: Rule = prefixedWithIndex('/docs')
export const nodejs: Rule = prefixedWithIndex('/docs')
export const planetscale: Rule = prefixedWithIndex('/docs')
export const render: Rule = prefixedWithIndex('/docs')
export const vercel: Rule = prefixedWithIndex('/docs')

// ---------------------------------------------------------------------------
// Built-in rules map (hostname → Rule)
// ---------------------------------------------------------------------------

export const builtinRules = new Map<string, Rule>([
  ['ai-sdk.dev', aiSdk],
  ['bun.sh', bun],
  ['code.claude.com', claudeCode],
  ['developers.cloudflare.com', cloudflare],
  ['developers.openai.com', openai],
  ['docs.anthropic.com', anthropic],
  ['docs.astral.sh', astral],
  ['docs.deno.com', deno],
  ['docs.github.com', githubDocs],
  ['docs.openclaw.ai', openclaw],
  ['docs.stripe.com', stripe],
  ['docs.tempo.xyz', tempo],
  ['github.com', github],
  ['hono.dev', hono],
  ['laravel.com', laravel],
  ['nextjs.org', nextjs],
  ['nodejs.org', nodejs],
  ['planetscale.com', planetscale],
  ['react.dev', reactDev],
  ['render.com', render],
  ['rolldown.rs', rolldown],
  ['router.vuejs.org', routerVue],
  ['rspack.rs', rspack],
  ['tanstack.com', tanstack],
  ['turbo.build', turbo],
  ['ui.shadcn.com', shadcn],
  ['vercel.com', vercel],
  ['viem.sh', viem],
  ['vitejs.dev', vite],
  ['vitest.dev', vitest],
  ['vuejs.org', vue],
  ['wagmi.sh', wagmi],
])
