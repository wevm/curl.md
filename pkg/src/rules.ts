import { defineRule } from './mod.ts'
import {
  appendIndexMd,
  appendMd,
  appendMdWithIndex,
  prefixedWithIndex,
  repo,
} from './rules/utils.ts'

export { githubBlob, githubIssue, githubPr } from './rules/github.ts'
export { githubDocs } from './rules/github-docs.ts'
export { mdn } from './rules/mdn.ts'
export { tailwind } from './rules/tailwind.ts'

export const aiSdk = appendMd({ key: 'aiSdk', patterns: ['ai-sdk.dev'] })
export const anthropic = appendMd({
  key: 'anthropic',
  patterns: ['docs.anthropic.com'],
})
export const claudeCode = appendMd({
  key: 'claudeCode',
  patterns: ['code.claude.com'],
})
export const openai = appendMd({
  key: 'openai',
  patterns: ['developers.openai.com'],
})
export const rolldown = appendMd({ key: 'rolldown', patterns: ['rolldown.rs'] })
export const routerVue = appendMd({
  key: 'routerVue',
  patterns: ['router.vuejs.org'],
})
export const shadcn = appendMd({ key: 'shadcn', patterns: ['ui.shadcn.com'] })
export const stripe = appendMd({ key: 'stripe', patterns: ['docs.stripe.com'] })
export const tanstack = appendMd({
  key: 'tanstack',
  patterns: ['tanstack.com'],
})
export const turbo = appendMd({ key: 'turbo', patterns: ['turbo.build'] })
export const vite = appendMd({ key: 'vite', patterns: ['vitejs.dev'] })
export const vitest = appendMd({ key: 'vitest', patterns: ['vitest.dev'] })
export const vue = appendMd({ key: 'vue', patterns: ['vuejs.org'] })

export const astral = appendMdWithIndex({
  key: 'astral',
  patterns: ['docs.astral.sh'],
})
export const openclaw = appendMdWithIndex({
  key: 'openclaw',
  patterns: ['docs.openclaw.ai'],
})
export const rspack = appendMdWithIndex({
  key: 'rspack',
  patterns: ['rspack.rs'],
})
export const tempo = appendMdWithIndex({
  key: 'tempo',
  patterns: ['docs.tempo.xyz'],
})
export const viem = appendMdWithIndex({ key: 'viem', patterns: ['viem.sh'] })
export const wagmi = appendMdWithIndex({ key: 'wagmi', patterns: ['wagmi.sh'] })

export const cloudflare = appendIndexMd({
  key: 'cloudflare',
  patterns: ['developers.cloudflare.com'],
})

export const deno = repo({
  key: 'deno',
  repo: 'denoland/docs',
  patterns: ['docs.deno.com'],
})
export const hono = repo({
  key: 'hono',
  repo: 'honojs/website',
  patterns: ['hono.dev'],
})

export const bun = prefixedWithIndex({
  key: 'bun',
  prefix: '/docs',
  patterns: ['bun.sh'],
})
export const laravel = prefixedWithIndex({
  key: 'laravel',
  prefix: '/docs',
  patterns: ['laravel.com'],
})
export const nextjs = prefixedWithIndex({
  key: 'nextjs',
  prefix: '/docs',
  patterns: ['nextjs.org'],
})
export const nodejs = prefixedWithIndex({
  key: 'nodejs',
  prefix: '/docs',
  patterns: ['nodejs.org'],
})
export const planetscale = prefixedWithIndex({
  key: 'planetscale',
  prefix: '/docs',
  patterns: ['planetscale.com'],
})
export const render = prefixedWithIndex({
  key: 'render',
  prefix: '/docs',
  patterns: ['render.com'],
})
export const vercel = prefixedWithIndex({
  key: 'vercel',
  prefix: '/docs',
  patterns: ['vercel.com'],
})

export const reactDev = defineRule({
  key: 'reactDev',
  patterns: ['react.dev'],
  rewrite(url) {
    if (url.pathname === '/' || url.pathname === '') return
    const mdUrl = new URL(url.href)
    mdUrl.pathname = `${mdUrl.pathname}.md`
    return mdUrl
  },
})
