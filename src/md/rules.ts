import { defineRule } from './mod.ts'
import { cloudflare } from './rules/cloudflare.ts'
import { githubBlob, githubIssue, githubPr, githubRepo } from './rules/github.ts'
import {
  acceptMarkdown,
  appendMd,
  appendMdWithIndex,
  prefixedWithIndex,
  repo,
} from './rules/utils.ts'

export { githubBlob, githubIssue, githubPr, githubRepo }
export { cloudflare }
export { githubDocs } from './rules/github-docs.ts'
export { mdn } from './rules/mdn.ts'
export { tailwind } from './rules/tailwind.ts'
export { zero } from './rules/zero.ts'

export const curlMd = defineRule<{ fetch?: typeof globalThis.fetch }>({
  key: 'curlMd',
  patterns: [
    new URLPattern({ hostname: 'curl.:tld(md|local)' }),
    new URLPattern({ hostname: '*.curl.:tld(md|local)' }),
  ],
  async fetch(_, _init, { options }) {
    const fetch = options.fetch ?? globalThis.fetch
    return fetch('https://curl.md/llms.txt')
  },
})

export const aiSdk = appendMd({
  key: 'aiSdk',
  patterns: [new URLPattern({ hostname: 'ai-sdk.dev' })],
  checks: [{ url: 'https://ai-sdk.dev/docs/introduction', contains: ['AI SDK'] }],
})
export const anthropic = appendMd({
  key: 'anthropic',
  patterns: [new URLPattern({ hostname: 'docs.anthropic.com' })],
  checks: [{ url: 'https://docs.anthropic.com/en/docs/overview', contains: ['Claude'] }],
})
export const claudeCode = appendMd({
  key: 'claudeCode',
  patterns: [new URLPattern({ hostname: 'code.claude.com' })],
  checks: [{ url: 'https://code.claude.com/docs/en/overview', contains: ['Claude'] }],
})
export const openai = appendMd({
  key: 'openai',
  patterns: [new URLPattern({ hostname: 'developers.openai.com' })],
  checks: [{ url: 'https://developers.openai.com/docs/quickstart', contains: ['OpenAI'] }],
})
export const rolldown = repo({
  key: 'rolldown',
  repo: 'rolldown/rolldown',
  prefix: 'docs',
  patterns: [new URLPattern({ hostname: 'rolldown.rs' })],
  checks: [{ url: 'https://rolldown.rs/guide/introduction', contains: ['Rolldown'] }],
})
export const routerVue = appendMd({
  key: 'routerVue',
  patterns: [new URLPattern({ hostname: 'router.vuejs.org' })],
  checks: [{ url: 'https://router.vuejs.org/guide', contains: ['router'] }],
})
export const shadcn = appendMd({
  key: 'shadcn',
  patterns: [new URLPattern({ hostname: 'ui.shadcn.com' })],
  checks: [{ url: 'https://ui.shadcn.com/docs', contains: ['shadcn'] }],
})
export const stripe = appendMd({
  key: 'stripe',
  patterns: [new URLPattern({ hostname: 'docs.stripe.com' })],
  checks: [{ url: 'https://docs.stripe.com/api', contains: ['Stripe'] }],
})
export const tanstack = appendMd({
  key: 'tanstack',
  patterns: [new URLPattern({ hostname: 'tanstack.com' })],
  checks: [
    {
      url: 'https://tanstack.com/start/latest/docs/framework/react/overview',
      contains: ['TanStack'],
    },
  ],
})
export const turbo = appendMd({
  key: 'turbo',
  patterns: [new URLPattern({ hostname: 'turbo.build' })],
  checks: [
    { url: 'https://turbo.build/repo/docs/getting-started/installation', contains: ['Turborepo'] },
  ],
})
export const vite = appendMd({
  key: 'vite',
  patterns: [new URLPattern({ hostname: 'vite.dev' })],
  checks: [{ url: 'https://vite.dev/guide', contains: ['Vite'] }],
})
export const vitest = appendMd({
  key: 'vitest',
  patterns: [new URLPattern({ hostname: 'vitest.dev' })],
  checks: [{ url: 'https://vitest.dev/guide', contains: ['Vitest'] }],
})
export const vue = appendMd({
  key: 'vue',
  patterns: [new URLPattern({ hostname: 'vuejs.org' })],
  checks: [{ url: 'https://vuejs.org/guide/introduction', contains: ['Vue'] }],
})

export const astral = appendMdWithIndex({
  key: 'astral',
  patterns: [new URLPattern({ hostname: 'docs.astral.sh' })],
  checks: [{ url: 'https://docs.astral.sh/uv/getting-started/installation/', contains: ['uv'] }],
})
export const baseUi = appendMd({
  key: 'baseUi',
  patterns: [new URLPattern({ hostname: 'base-ui.com', pathname: '/react/:path+' })],
  checks: [
    {
      url: 'https://base-ui.com/react/overview/quick-start',
      contains: ['# Quick start', 'npm i @base-ui/react'],
      minLength: 500,
      title: 'Quick start',
    },
  ],
})
export const openclaw = appendMdWithIndex({
  key: 'openclaw',
  patterns: [new URLPattern({ hostname: 'docs.openclaw.ai' })],
  checks: [{ url: 'https://docs.openclaw.ai/getting-started', contains: ['OpenClaw'] }],
})
export const rspack = appendMdWithIndex({
  key: 'rspack',
  patterns: [new URLPattern({ hostname: 'rspack.rs' })],
  checks: [{ url: 'https://rspack.rs/guide/start/introduction', contains: ['Rspack'] }],
})
export const tempo = appendMdWithIndex({
  key: 'tempo',
  patterns: [new URLPattern({ hostname: 'docs.tempo.xyz' })],
  checks: [{ url: 'https://docs.tempo.xyz/learn/stablecoins', contains: ['Tempo'] }],
})
export const viem = appendMdWithIndex({
  key: 'viem',
  patterns: [new URLPattern({ hostname: 'viem.sh' })],
  checks: [{ url: 'https://viem.sh/docs/getting-started', contains: ['viem'] }],
})
export const wagmi = appendMdWithIndex({
  key: 'wagmi',
  patterns: [new URLPattern({ hostname: 'wagmi.sh' })],
  checks: [{ url: 'https://wagmi.sh/react/getting-started', contains: ['Wagmi'] }],
})

export const deno = repo({
  key: 'deno',
  repo: 'denoland/docs',
  patterns: [new URLPattern({ hostname: 'docs.deno.com' })],
  checks: [
    {
      url: 'https://docs.deno.com/runtime/getting_started/first_project',
      contains: ['Deno'],
    },
  ],
})
export const hono = acceptMarkdown({
  key: 'hono',
  patterns: [new URLPattern({ hostname: 'hono.dev' })],
  checks: [{ url: 'https://hono.dev/docs/getting-started/basic', contains: ['Hono'] }],
})
export const resend = acceptMarkdown({
  key: 'resend',
  patterns: [new URLPattern({ hostname: 'resend.com' })],
  checks: [{ url: 'https://resend.com/docs/introduction', contains: ['Resend'] }],
})

export const bun = prefixedWithIndex({
  key: 'bun',
  prefix: '/docs',
  patterns: [new URLPattern({ hostname: 'bun.sh' })],
  checks: [{ url: 'https://bun.sh/docs/installation', contains: ['bun'] }],
})
export const laravel = prefixedWithIndex({
  key: 'laravel',
  prefix: '/docs',
  patterns: [new URLPattern({ hostname: 'laravel.com' })],
  checks: [{ url: 'https://laravel.com/docs/installation', contains: ['Laravel'] }],
})
export const nextjs = prefixedWithIndex({
  key: 'nextjs',
  prefix: '/docs',
  patterns: [new URLPattern({ hostname: 'nextjs.org' })],
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
  patterns: [new URLPattern({ hostname: 'nodejs.org' })],
  checks: [{ url: 'https://nodejs.org/docs/latest/api/assert', contains: ['Node'] }],
})
export const planetscale = prefixedWithIndex({
  key: 'planetscale',
  prefix: '/docs',
  patterns: [new URLPattern({ hostname: 'planetscale.com' })],
  checks: [{ url: 'https://planetscale.com/docs/vitess', contains: ['PlanetScale'] }],
})
export const render = prefixedWithIndex({
  key: 'render',
  prefix: '/docs',
  patterns: [new URLPattern({ hostname: 'render.com' })],
  checks: [{ url: 'https://render.com/docs/web-services', contains: ['Render'] }],
})
export const vercel = prefixedWithIndex({
  key: 'vercel',
  prefix: '/docs',
  patterns: [new URLPattern({ hostname: 'vercel.com' })],
  checks: [{ url: 'https://vercel.com/docs/getting-started-with-vercel', contains: ['Vercel'] }],
})

export const vitePlus = repo({
  key: 'vitePlus',
  repo: 'voidzero-dev/vite-plus',
  prefix: 'docs',
  patterns: [new URLPattern({ hostname: 'viteplus.dev' })],
  checks: [{ url: 'https://viteplus.dev/guide/install', contains: ['install'] }],
})
export const oxc = defineRule({
  key: 'oxc',
  patterns: [new URLPattern({ hostname: 'oxc.rs' })],
  checks: [{ url: 'https://oxc.rs/docs/guide/usage/linter/config.html', contains: ['oxlint'] }],
  rewrite(url) {
    if (url.pathname === '/' || url.pathname === '') return
    const mdUrl = new URL(
      `https://raw.githubusercontent.com/oxc-project/website/main/src${url.pathname.replace(/\.html$/, '')}.md`,
    )
    return mdUrl
  },
})
export const reactDev = defineRule({
  key: 'reactDev',
  patterns: [new URLPattern({ hostname: 'react.dev' })],
  checks: [{ url: 'https://react.dev/reference/react/useState', contains: ['useState'] }],
  rewrite(url) {
    if (url.pathname === '/' || url.pathname === '') return
    const mdUrl = new URL(url.href)
    mdUrl.pathname = `${mdUrl.pathname}.md`
    return mdUrl
  },
})
