import { defineRule } from './mod.ts'
import { githubBlob, githubIssue, githubPr, githubRepo } from './rules/github.ts'
import {
  acceptMarkdown,
  appendIndexMd,
  appendMd,
  appendMdWithIndex,
  prefixedWithIndex,
  repo,
} from './rules/utils.ts'

export { githubBlob, githubIssue, githubPr, githubRepo }
export { githubDocs } from './rules/github-docs.ts'
export { mdn } from './rules/mdn.ts'
export { tailwind } from './rules/tailwind.ts'

export const curlMd = defineRule<{ fetch?: typeof globalThis.fetch }>({
  key: 'curlMd',
  patterns: [/(?:^|\.)curl\.(md|local)$/],
  async fetch(_, _init, { options }) {
    const fetch = options.fetch ?? globalThis.fetch
    return fetch('https://curl.md/llms.txt')
  },
})

export const aiSdk = appendMd({
  key: 'aiSdk',
  patterns: ['ai-sdk.dev'],
  checks: [{ url: 'https://ai-sdk.dev/docs/introduction', contains: ['AI SDK'] }],
})
export const anthropic = appendMd({
  key: 'anthropic',
  patterns: ['docs.anthropic.com'],
  checks: [{ url: 'https://docs.anthropic.com/en/docs/overview', contains: ['Claude'] }],
})
export const claudeCode = appendMd({
  key: 'claudeCode',
  patterns: ['code.claude.com'],
  checks: [{ url: 'https://code.claude.com/docs/en/overview', contains: ['Claude'] }],
})
export const openai = appendMd({
  key: 'openai',
  patterns: ['developers.openai.com'],
  checks: [{ url: 'https://developers.openai.com/docs/quickstart', contains: ['OpenAI'] }],
})
export const rolldown = appendMd({
  key: 'rolldown',
  patterns: ['rolldown.rs'],
  checks: [{ url: 'https://rolldown.rs/guide/introduction', contains: ['Rolldown'] }],
})
export const routerVue = appendMd({
  key: 'routerVue',
  patterns: ['router.vuejs.org'],
  checks: [{ url: 'https://router.vuejs.org/guide', contains: ['router'] }],
})
export const shadcn = appendMd({
  key: 'shadcn',
  patterns: ['ui.shadcn.com'],
  checks: [{ url: 'https://ui.shadcn.com/docs', contains: ['shadcn'] }],
})
export const stripe = appendMd({
  key: 'stripe',
  patterns: ['docs.stripe.com'],
  checks: [{ url: 'https://docs.stripe.com/api', contains: ['Stripe'] }],
})
export const tanstack = appendMd({
  key: 'tanstack',
  patterns: ['tanstack.com'],
  checks: [
    {
      url: 'https://tanstack.com/start/latest/docs/framework/react/overview',
      contains: ['TanStack'],
    },
  ],
})
export const turbo = appendMd({
  key: 'turbo',
  patterns: ['turbo.build'],
  checks: [
    { url: 'https://turbo.build/repo/docs/getting-started/installation', contains: ['Turborepo'] },
  ],
})
export const vite = appendMd({
  key: 'vite',
  patterns: ['vitejs.dev'],
  checks: [{ url: 'https://vitejs.dev/guide', contains: ['Vite'] }],
})
export const vitest = appendMd({
  key: 'vitest',
  patterns: ['vitest.dev'],
  checks: [{ url: 'https://vitest.dev/guide', contains: ['Vitest'] }],
})
export const vue = appendMd({
  key: 'vue',
  patterns: ['vuejs.org'],
  checks: [{ url: 'https://vuejs.org/guide/introduction', contains: ['Vue'] }],
})

export const astral = appendMdWithIndex({
  key: 'astral',
  patterns: ['docs.astral.sh'],
  checks: [{ url: 'https://docs.astral.sh/uv/getting-started/installation/', contains: ['uv'] }],
})
export const openclaw = appendMdWithIndex({
  key: 'openclaw',
  patterns: ['docs.openclaw.ai'],
  checks: [{ url: 'https://docs.openclaw.ai/getting-started', contains: ['OpenClaw'] }],
})
export const rspack = appendMdWithIndex({
  key: 'rspack',
  patterns: ['rspack.rs'],
  checks: [{ url: 'https://rspack.rs/guide/start/introduction', contains: ['Rspack'] }],
})
export const tempo = appendMdWithIndex({
  key: 'tempo',
  patterns: ['docs.tempo.xyz'],
  checks: [{ url: 'https://docs.tempo.xyz/learn/stablecoins', contains: ['Tempo'] }],
})
export const viem = appendMdWithIndex({
  key: 'viem',
  patterns: ['viem.sh'],
  checks: [{ url: 'https://viem.sh/docs/getting-started', contains: ['viem'] }],
})
export const wagmi = appendMdWithIndex({
  key: 'wagmi',
  patterns: ['wagmi.sh'],
  checks: [{ url: 'https://wagmi.sh/react/getting-started', contains: ['Wagmi'] }],
})

export const cloudflare = appendIndexMd({
  key: 'cloudflare',
  patterns: ['developers.cloudflare.com'],
  checks: [{ url: 'https://developers.cloudflare.com/workers/', contains: ['Workers'] }],
})

export const deno = repo({
  key: 'deno',
  repo: 'denoland/docs',
  patterns: ['docs.deno.com'],
  checks: [
    {
      url: 'https://docs.deno.com/runtime/getting_started/first_project',
      contains: ['Deno'],
    },
  ],
})
export const hono = acceptMarkdown({
  key: 'hono',
  patterns: ['hono.dev'],
  checks: [{ url: 'https://hono.dev/docs/getting-started/basic', contains: ['Hono'] }],
})
export const resend = acceptMarkdown({
  key: 'resend',
  patterns: ['resend.com'],
  checks: [{ url: 'https://resend.com/docs/introduction', contains: ['Resend'] }],
})

export const bun = prefixedWithIndex({
  key: 'bun',
  prefix: '/docs',
  patterns: ['bun.sh'],
  checks: [{ url: 'https://bun.sh/docs/installation', contains: ['bun'] }],
})
export const laravel = prefixedWithIndex({
  key: 'laravel',
  prefix: '/docs',
  patterns: ['laravel.com'],
  checks: [{ url: 'https://laravel.com/docs/installation', contains: ['Laravel'] }],
})
export const nextjs = prefixedWithIndex({
  key: 'nextjs',
  prefix: '/docs',
  patterns: ['nextjs.org'],
  checks: [
    {
      url: 'https://nextjs.org/docs/getting-started/installation',
      contains: ['Next.js'],
    },
  ],
})
export const nodejs = prefixedWithIndex({
  key: 'nodejs',
  prefix: '/docs',
  patterns: ['nodejs.org'],
  checks: [{ url: 'https://nodejs.org/docs/latest/api/assert', contains: ['Node'] }],
})
export const planetscale = prefixedWithIndex({
  key: 'planetscale',
  prefix: '/docs',
  patterns: ['planetscale.com'],
  checks: [{ url: 'https://planetscale.com/docs/vitess', contains: ['PlanetScale'] }],
})
export const render = prefixedWithIndex({
  key: 'render',
  prefix: '/docs',
  patterns: ['render.com'],
  checks: [{ url: 'https://render.com/docs/web-services', contains: ['Render'] }],
})
export const vercel = prefixedWithIndex({
  key: 'vercel',
  prefix: '/docs',
  patterns: ['vercel.com'],
  checks: [{ url: 'https://vercel.com/docs/getting-started-with-vercel', contains: ['Vercel'] }],
})

export const reactDev = defineRule({
  key: 'reactDev',
  patterns: ['react.dev'],
  checks: [{ url: 'https://react.dev/reference/react/useState', contains: ['useState'] }],
  rewrite(url) {
    if (url.pathname === '/' || url.pathname === '') return
    const mdUrl = new URL(url.href)
    mdUrl.pathname = `${mdUrl.pathname}.md`
    return mdUrl
  },
})
