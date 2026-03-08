import { defineRule } from '../defineRule.ts'
import {
  appendIndexMd,
  appendMd,
  appendMdUrl,
  appendMdWithIndex,
  githubRepo,
  prefixedWithIndex,
} from './helpers.ts'

export { githubBlob, githubIssue, githubPr } from './github.ts'
export { githubDocs } from './github-docs.ts'
export { mdn } from './mdn.ts'

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
export const planetscale = prefixedWithIndex({
  prefix: '/docs',
  patterns: ['planetscale.com'],
})
export const render = prefixedWithIndex({
  prefix: '/docs',
  patterns: ['render.com'],
})
export const vercel = prefixedWithIndex({
  prefix: '/docs',
  patterns: ['vercel.com'],
})

export const reactDev = defineRule({
  patterns: ['react.dev'],
  resolve: (url) => {
    if (url.pathname === '/' || url.pathname === '') return
    return appendMdUrl(url)
  },
})
