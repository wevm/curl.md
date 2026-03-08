import type { Rule } from '../defineRule.ts'
import {
  appendIndexMd,
  appendMd,
  appendMdUrl,
  appendMdWithIndex,
  githubRepo,
  prefixedWithIndex,
} from './helpers.ts'

export const aiSdk = appendMd({ patterns: ['ai-sdk.dev'] })
export const anthropic = appendMd({ patterns: ['docs.anthropic.com'] })
export const claudeCode = appendMd({ patterns: ['code.claude.com'] })
export const openai = appendMd({ patterns: ['developers.openai.com'] })
export const rolldown = appendMd({ patterns: ['rolldown.rs'] })
export const routerVue = appendMd({ patterns: ['router.vuejs.org'] })
export const shadcn = appendMd({ patterns: ['ui.shadcn.com'] })
export const stripe = appendMd({ patterns: ['docs.stripe.com'] })
export const tanstack = appendMd({ patterns: ['tanstack.com'] })
export const turbo = appendMd({ patterns: ['turbo.build'] })
export const vite = appendMd({ patterns: ['vitejs.dev'] })
export const vitest = appendMd({ patterns: ['vitest.dev'] })
export const vue = appendMd({ patterns: ['vuejs.org'] })

export const astral = appendMdWithIndex({ patterns: ['docs.astral.sh'] })
export const openclaw = appendMdWithIndex({ patterns: ['docs.openclaw.ai'] })
export const rspack = appendMdWithIndex({ patterns: ['rspack.rs'] })
export const tempo = appendMdWithIndex({ patterns: ['docs.tempo.xyz'] })
export const viem = appendMdWithIndex({ patterns: ['viem.sh'] })
export const wagmi = appendMdWithIndex({ patterns: ['wagmi.sh'] })

export const cloudflare = appendIndexMd({
  patterns: ['developers.cloudflare.com'],
})

export const deno = githubRepo({
  repo: 'denoland/docs',
  patterns: ['docs.deno.com'],
})
export const hono = githubRepo({
  repo: 'honojs/website',
  patterns: ['hono.dev'],
})

export const bun = prefixedWithIndex({ prefix: '/docs', patterns: ['bun.sh'] })
export const laravel = prefixedWithIndex({
  prefix: '/docs',
  patterns: ['laravel.com'],
})
export const nextjs = prefixedWithIndex({
  prefix: '/docs',
  patterns: ['nextjs.org'],
})
export const nodejs = prefixedWithIndex({
  prefix: '/docs',
  patterns: ['nodejs.org'],
})
// biome-ignore format: single-line rule
export const planetscale = prefixedWithIndex({ prefix: '/docs', patterns: ['planetscale.com'] })
export const render = prefixedWithIndex({
  prefix: '/docs',
  patterns: ['render.com'],
})
export const vercel = prefixedWithIndex({
  prefix: '/docs',
  patterns: ['vercel.com'],
})

export const reactDev = {
  patterns: ['react.dev'],
  resolve: (url: URL) => {
    if (url.pathname === '/' || url.pathname === '') return
    return appendMdUrl(url)
  },
} satisfies Rule

export const github = {
  patterns: ['github.com'],
  resolve: (url: URL) => {
    const match = url.pathname.match(/^\/([^/]+\/[^/]+)\/blob\/(.+)/)
    if (!match) return
    if (!/\.mdx?$/.test(match[2])) return
    return new URL(`https://raw.githubusercontent.com/${match[1]}/${match[2]}`)
  },
} satisfies Rule

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

export const githubDocs = {
  patterns: ['docs.github.com'],
  resolve: (url: URL) => {
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
  parse: async (response: Response) => {
    const json = (await response.json()) as {
      body?: string
      meta?: Record<string, string>
    }
    return {
      content: typeof json.body === 'string' ? json.body : JSON.stringify(json),
      meta: {
        ...(json.meta?.title && { title: json.meta.title }),
        ...(json.meta?.intro && { description: json.meta.intro }),
      },
    }
  },
} satisfies Rule
