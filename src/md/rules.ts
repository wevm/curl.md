import { fromHtml } from './fromHtml.ts'
import { defineRule } from './mod.ts'
import { cloudflare } from './rules/cloudflare.ts'
import { curlDocs, curlMd } from './rules/curl.ts'
import { githubBlob, githubIssue, githubPr, githubPrChanges, githubRepo } from './rules/github.ts'
import {
  acceptMarkdown,
  appendMd,
  appendMdWithoutHtml,
  appendMdWithIndex,
  githubPageMarkdown,
  prefixedWithIndex,
  repo,
  rawRepoWithIndex,
} from './rules/utils.ts'

export { githubBlob, githubIssue, githubPr, githubPrChanges, githubRepo }
export { cloudflare }
export { curlDocs, curlMd }
export { githubDocs } from './rules/github-docs.ts'
export { mdn } from './rules/mdn.ts'
export { tailwind } from './rules/tailwind.ts'
export { zero } from './rules/zero.ts'

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
export const conductor = acceptMarkdown({
  key: 'conductor',
  patterns: [
    new URLPattern({ hostname: 'conductor.build', pathname: '/docs' }),
    new URLPattern({ hostname: 'conductor.build', pathname: '/docs/' }),
    new URLPattern({ hostname: 'conductor.build', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: 'www.conductor.build', pathname: '/docs' }),
    new URLPattern({ hostname: 'www.conductor.build', pathname: '/docs/' }),
    new URLPattern({ hostname: 'www.conductor.build', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: 'docs.conductor.build', pathname: '/' }),
    new URLPattern({ hostname: 'docs.conductor.build', pathname: '/:path+' }),
  ],
  checks: [
    {
      url: 'https://www.conductor.build/docs',
      contains: ['Conductor simplifies running Claude Code'],
    },
  ],
})
export const docker = acceptMarkdown({
  key: 'docker',
  patterns: [new URLPattern({ hostname: 'docs.docker.com' })],
  checks: [{ url: 'https://docs.docker.com/get-started/', contains: ['Get started'] }],
})
export const drizzle = rawRepoWithIndex({
  key: 'drizzle',
  repo: 'drizzle-team/drizzle-orm-docs',
  prefix: 'src/content/docs',
  stripPrefix: '/docs',
  extension: '.mdx',
  patterns: [
    new URLPattern({ hostname: 'orm.drizzle.team', pathname: '/docs' }),
    new URLPattern({ hostname: 'orm.drizzle.team', pathname: '/docs/' }),
    new URLPattern({ hostname: 'orm.drizzle.team', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: 'orm.drizzle.team', pathname: '/docs/:path+/' }),
  ],
  checks: [{ url: 'https://orm.drizzle.team/docs/overview', contains: ['Drizzle ORM'] }],
})
export const expo = defineRule({
  key: 'expo',
  patterns: [
    new URLPattern({ hostname: 'docs.expo.dev' }),
    new URLPattern({ hostname: 'expo.dev', pathname: '/blog/:slug' }),
    new URLPattern({ hostname: 'expo.dev', pathname: '/blog/:slug/' }),
  ],
  checks: [
    {
      url: 'https://docs.expo.dev/get-started/start-developing/',
      contains: ['Make your first change to an Expo project and see it live on your device.'],
    },
    {
      url: 'https://expo.dev/blog/expo-go-vs-development-builds',
      contains: [
        'Development builds and Expo Go are both tools for developing React Native apps',
        '## What exactly is Expo Go?',
      ],
      minLength: 500,
      title: 'Expo Go vs Development Builds',
    },
  ],
  rewrite(url) {
    if (/\.mdx?$/i.test(url.pathname)) return
    const mdUrl = new URL(url.href)
    mdUrl.pathname = url.pathname === '/' ? '/index.md' : `${url.pathname.replace(/\/$/, '')}.md`
    return mdUrl
  },
})
export const openai = appendMd({
  key: 'openai',
  patterns: [new URLPattern({ hostname: 'developers.openai.com' })],
  checks: [{ url: 'https://developers.openai.com/docs/quickstart', contains: ['OpenAI'] }],
})
export const kubernetes = rawRepoWithIndex({
  key: 'kubernetes',
  repo: 'kubernetes/website',
  prefix: 'content/en',
  extension: '.md',
  indexName: '_index',
  patterns: [
    new URLPattern({ hostname: 'kubernetes.io', pathname: '/docs' }),
    new URLPattern({ hostname: 'kubernetes.io', pathname: '/docs/' }),
    new URLPattern({ hostname: 'kubernetes.io', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: 'kubernetes.io', pathname: '/docs/:path+/' }),
  ],
  checks: [
    {
      url: 'https://kubernetes.io/docs/concepts/overview/',
      contains: ['This page is an overview of Kubernetes.'],
    },
  ],
})
export const nuxt = acceptMarkdown({
  key: 'nuxt',
  patterns: [
    new URLPattern({ hostname: 'nuxt.com', pathname: '/docs' }),
    new URLPattern({ hostname: 'nuxt.com', pathname: '/docs/' }),
    new URLPattern({ hostname: 'nuxt.com', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: 'nuxt.com', pathname: '/docs/:path+/' }),
  ],
  checks: [
    {
      url: 'https://nuxt.com/docs/getting-started/introduction',
      contains: ['Nuxt is a free and [open-source framework]'],
    },
  ],
})
export const pnpm = githubPageMarkdown({
  key: 'pnpm',
  patterns: [new URLPattern({ hostname: 'pnpm.io' })],
  checks: [{ url: 'https://pnpm.io/installation', contains: ['pnpm', 'Corepack'] }],
})
export const prisma = rawRepoWithIndex({
  key: 'prisma',
  repo: 'prisma/docs',
  prefix: 'apps/docs/content',
  extension: '.mdx',
  patterns: [
    new URLPattern({ hostname: 'prisma.io', pathname: '/docs' }),
    new URLPattern({ hostname: 'prisma.io', pathname: '/docs/' }),
    new URLPattern({ hostname: 'prisma.io', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: 'prisma.io', pathname: '/docs/:path+/' }),
    new URLPattern({ hostname: 'www.prisma.io', pathname: '/docs' }),
    new URLPattern({ hostname: 'www.prisma.io', pathname: '/docs/' }),
    new URLPattern({ hostname: 'www.prisma.io', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: 'www.prisma.io', pathname: '/docs/:path+/' }),
  ],
  checks: [
    {
      url: 'https://www.prisma.io/docs/orm/prisma-client/queries/crud',
      contains: ['This page describes how to perform CRUD operations with Prisma Client'],
    },
  ],
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
export const tanstackBlog = repo({
  key: 'tanstackBlog',
  repo: 'tanstack/tanstack.com',
  prefix: 'src',
  patterns: [new URLPattern({ hostname: 'tanstack.com', pathname: '/blog/:path+' })],
  checks: [
    {
      url: 'https://tanstack.com/blog/react-server-components',
      contains: ['What are server components?', 'The RSC Status Quo'],
    },
  ],
})
export const tanstack = acceptMarkdown({
  key: 'tanstack',
  patterns: [
    new URLPattern({ hostname: 'tanstack.com', pathname: '/:product/:version/docs' }),
    new URLPattern({ hostname: 'tanstack.com', pathname: '/:product/:version/docs/:path+' }),
  ],
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
export const vite = appendMdWithoutHtml({
  key: 'vite',
  patterns: [new URLPattern({ hostname: 'vite.dev' })],
  checks: [{ url: 'https://vite.dev/guide', contains: ['Vite'] }],
})
export const vitepress = appendMdWithoutHtml({
  key: 'vitepress',
  patterns: [new URLPattern({ hostname: 'vitepress.dev' })],
  checks: [{ url: 'https://vitepress.dev/guide/what-is-vitepress', contains: ['VitePress'] }],
})
export const vitest = appendMdWithoutHtml({
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
export const betterAuth = rawRepoWithIndex({
  key: 'betterAuth',
  repo: 'better-auth/better-auth',
  prefix: 'docs/content/docs',
  stripPrefix: '/docs',
  extension: '.mdx',
  patterns: [
    new URLPattern({ hostname: 'better-auth.com', pathname: '/docs' }),
    new URLPattern({ hostname: 'better-auth.com', pathname: '/docs/' }),
    new URLPattern({ hostname: 'better-auth.com', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: 'better-auth.com', pathname: '/docs/:path+/' }),
    new URLPattern({ hostname: 'www.better-auth.com', pathname: '/docs' }),
    new URLPattern({ hostname: 'www.better-auth.com', pathname: '/docs/' }),
    new URLPattern({ hostname: 'www.better-auth.com', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: 'www.better-auth.com', pathname: '/docs/:path+/' }),
  ],
  checks: [
    {
      url: 'https://www.better-auth.com/docs/introduction',
      contains: ['Better Auth is a framework-agnostic'],
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
// https://x.com/josevalim/status/2042581154067337280
export const hexdocs = acceptMarkdown({
  key: 'hexdocs',
  patterns: [new URLPattern({ hostname: 'hexdocs.pm' })],
  checks: [
    {
      url: 'https://hexdocs.pm/ex_doc',
      contains: ['ExDoc is a documentation generation tool for Elixir'],
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
export const sentry = acceptMarkdown({
  key: 'sentry',
  patterns: [new URLPattern({ hostname: 'docs.sentry.io' })],
  checks: [
    {
      url: 'https://docs.sentry.io/platforms/javascript/guides/react/',
      contains: ['# React | Sentry for React', 'npm install @sentry/react --save'],
      minLength: 500,
      title: 'React',
    },
  ],
})
export const supabase = rawRepoWithIndex({
  key: 'supabase',
  repo: 'supabase/supabase',
  branch: 'master',
  prefix: 'apps/docs/content',
  stripPrefix: '/docs',
  extension: '.mdx',
  patterns: [
    new URLPattern({ hostname: 'supabase.com', pathname: '/docs' }),
    new URLPattern({ hostname: 'supabase.com', pathname: '/docs/' }),
    new URLPattern({ hostname: 'supabase.com', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: 'supabase.com', pathname: '/docs/:path+/' }),
  ],
  checks: [
    {
      url: 'https://supabase.com/docs/guides/getting-started',
      contains: ['### Use cases'],
    },
  ],
})
export const svelte = githubPageMarkdown({
  key: 'svelte',
  patterns: [
    new URLPattern({ hostname: 'svelte.dev', pathname: '/docs/svelte' }),
    new URLPattern({ hostname: 'svelte.dev', pathname: '/docs/svelte/' }),
    new URLPattern({ hostname: 'svelte.dev', pathname: '/docs/svelte/:path+' }),
    new URLPattern({ hostname: 'svelte.dev', pathname: '/docs/svelte/:path+/' }),
  ],
  checks: [
    {
      url: 'https://svelte.dev/docs/svelte/overview',
      contains: ['Svelte is a framework for building user interfaces on the web.'],
    },
  ],
})
export const svelteKit = githubPageMarkdown({
  key: 'svelteKit',
  patterns: [
    new URLPattern({ hostname: 'svelte.dev', pathname: '/docs/kit' }),
    new URLPattern({ hostname: 'svelte.dev', pathname: '/docs/kit/' }),
    new URLPattern({ hostname: 'svelte.dev', pathname: '/docs/kit/:path+' }),
    new URLPattern({ hostname: 'svelte.dev', pathname: '/docs/kit/:path+/' }),
  ],
  checks: [
    {
      url: 'https://svelte.dev/docs/kit/introduction',
      contains: ['SvelteKit is a framework for rapidly developing'],
    },
  ],
})
export const typescript = githubPageMarkdown({
  key: 'typescript',
  patterns: [
    new URLPattern({ hostname: 'typescriptlang.org', pathname: '/docs' }),
    new URLPattern({ hostname: 'typescriptlang.org', pathname: '/docs/' }),
    new URLPattern({ hostname: 'typescriptlang.org', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: 'typescriptlang.org', pathname: '/docs/:path+/' }),
    new URLPattern({ hostname: 'www.typescriptlang.org', pathname: '/docs' }),
    new URLPattern({ hostname: 'www.typescriptlang.org', pathname: '/docs/' }),
    new URLPattern({ hostname: 'www.typescriptlang.org', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: 'www.typescriptlang.org', pathname: '/docs/:path+/' }),
  ],
  checks: [
    {
      url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
      contains: ['The goal of TypeScript is to be a static typechecker for JavaScript programs'],
    },
  ],
})
export const zod = rawRepoWithIndex({
  key: 'zod',
  repo: 'colinhacks/zod',
  prefix: 'packages/docs/content',
  extension: '.mdx',
  patterns: [new URLPattern({ hostname: 'zod.dev' })],
  checks: [
    {
      url: 'https://zod.dev/basics',
      contains: ['This page will walk you through the basics of creating schemas'],
    },
  ],
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
export const postgres = defineRule({
  key: 'postgres',
  patterns: [
    new URLPattern({ hostname: 'postgresql.org', pathname: '/docs' }),
    new URLPattern({ hostname: 'postgresql.org', pathname: '/docs/' }),
    new URLPattern({ hostname: 'postgresql.org', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: 'www.postgresql.org', pathname: '/docs' }),
    new URLPattern({ hostname: 'www.postgresql.org', pathname: '/docs/' }),
    new URLPattern({ hostname: 'www.postgresql.org', pathname: '/docs/:path+' }),
  ],
  checks: [
    {
      url: 'https://www.postgresql.org/docs/current/sql-select.html',
      contains: ['SELECT, TABLE, WITH — retrieve rows from a table or view', '## Synopsis'],
      minLength: 500,
      title: 'SELECT',
    },
  ],
  async extract(response) {
    const html = await response.text()
    const result = await fromHtml(html, {
      baseUrl: response.url,
      profile: html.includes('id="docContent"')
        ? {
            contentRootSelectors: ['#docContent'],
            key: 'postgres',
            markers: ['dom:docContent'],
          }
        : undefined,
    })
    const title = html.match(/<span class="refentrytitle">([^<]+)<\/span>/)?.[1]?.trim()
    const description = html
      .match(/<div class="refnamediv">[\s\S]*?<p>([\s\S]*?)<\/p>/)?.[1]
      ?.replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    return {
      content: result.content,
      meta: {
        ...result.meta,
        ...(description && { description }),
        ...(title && { title }),
      },
    }
  },
})
export const render = prefixedWithIndex({
  key: 'render',
  prefix: '/docs',
  patterns: [new URLPattern({ hostname: 'render.com' })],
  checks: [{ url: 'https://render.com/docs/web-services', contains: ['Render'] }],
})
export const terraform = githubPageMarkdown({
  key: 'terraform',
  patterns: [
    new URLPattern({ hostname: 'developer.hashicorp.com', pathname: '/terraform' }),
    new URLPattern({ hostname: 'developer.hashicorp.com', pathname: '/terraform/' }),
    new URLPattern({ hostname: 'developer.hashicorp.com', pathname: '/terraform/:path+' }),
  ],
  checks: [
    {
      url: 'https://developer.hashicorp.com/terraform/language/modules/configuration',
      contains: ['Use modules in your configuration'],
    },
  ],
})
export const vercel = prefixedWithIndex({
  key: 'vercel',
  prefix: '/docs',
  patterns: [new URLPattern({ hostname: 'vercel.com' })],
  checks: [{ url: 'https://vercel.com/docs/getting-started-with-vercel', contains: ['Vercel'] }],
})

export const vitePlus = defineRule({
  key: 'vitePlus',
  patterns: [new URLPattern({ hostname: 'viteplus.dev' })],
  checks: [{ url: 'https://viteplus.dev/guide/install', contains: ['install'] }],
  rewrite(url) {
    return vitePlusRawCandidates(url)[0]
  },
  async fetch(input, init, { fetch }) {
    let lastResponse = new Response(null, { status: 404 })
    for (const candidate of vitePlusRawCandidates(asUrl(input))) {
      const response = await fetch(candidate, init)
      if (response.ok) return response
      if (response.status !== 404) return response
      lastResponse = response
    }
    return lastResponse
  },
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

function asUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input
  if (input instanceof Request) return new URL(input.url)
  return new URL(input)
}

function vitePlusRawCandidates(url: URL): URL[] {
  const pathname = (() => {
    if (url.hostname === 'viteplus.dev') return url.pathname || '/'

    const prefix = '/voidzero-dev/vite-plus/main/docs'
    if (url.hostname !== 'raw.githubusercontent.com' || !url.pathname.startsWith(prefix))
      return url.pathname || '/'

    const relative = url.pathname.slice(prefix.length) || '/'
    if (relative === '/index.md') return '/'
    if (relative.endsWith('/index.md')) return relative.slice(0, -'/index.md'.length) || '/'
    if (relative.endsWith('.md')) return relative.slice(0, -'.md'.length) || '/'
    return relative
  })()
  const trimmed = pathname === '/' ? '' : pathname.replace(/\/$/, '')
  const paths = [`${trimmed || '/index'}.md`, `${trimmed || '/index'}/index.md`]
  return [...new Set(paths)].map(
    (path) => new URL(`https://raw.githubusercontent.com/voidzero-dev/vite-plus/main/docs${path}`),
  )
}
