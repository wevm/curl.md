import { describe, expect, test } from 'vitest'
import * as rules from './rules.ts'

/** Call rewrite with a dummy match (these rules don't use match) */
function rewrite(rule: ReturnType<(typeof rules)['aiSdk']>, url: string) {
  return rule.rewrite?.(new URL(url), {} as URLPatternResult)
}

function patternsMatchHostname(rule: { patterns: URLPattern[] }, hostname: string) {
  return rule.patterns.some((p) => p.test({ hostname }))
}

describe('appendMd', () => {
  test.each([
    {
      name: 'aiSdk',
      factory: rules.aiSdk,
      hostname: 'ai-sdk.dev',
      url: 'https://ai-sdk.dev/docs/getting-started',
    },
    {
      name: 'anthropic',
      factory: rules.anthropic,
      hostname: 'docs.anthropic.com',
      url: 'https://docs.anthropic.com/en/docs/overview',
    },
    {
      name: 'claudeCode',
      factory: rules.claudeCode,
      hostname: 'code.claude.com',
      url: 'https://code.claude.com/docs/overview',
    },
    {
      name: 'openai',
      factory: rules.openai,
      hostname: 'developers.openai.com',
      url: 'https://developers.openai.com/docs/api',
    },
    {
      name: 'routerVue',
      factory: rules.routerVue,
      hostname: 'router.vuejs.org',
      url: 'https://router.vuejs.org/guide',
    },
    {
      name: 'shadcn',
      factory: rules.shadcn,
      hostname: 'ui.shadcn.com',
      url: 'https://ui.shadcn.com/docs/components/button',
    },
    {
      name: 'stripe',
      factory: rules.stripe,
      hostname: 'docs.stripe.com',
      url: 'https://docs.stripe.com/payments',
    },
    {
      name: 'tanstack',
      factory: rules.tanstack,
      hostname: 'tanstack.com',
      url: 'https://tanstack.com/query/latest/docs/overview',
    },
    {
      name: 'turbo',
      factory: rules.turbo,
      hostname: 'turbo.build',
      url: 'https://turbo.build/repo/docs',
    },
    { name: 'vite', factory: rules.vite, hostname: 'vite.dev', url: 'https://vite.dev/guide' },
    {
      name: 'vitest',
      factory: rules.vitest,
      hostname: 'vitest.dev',
      url: 'https://vitest.dev/guide',
    },
    {
      name: 'vue',
      factory: rules.vue,
      hostname: 'vuejs.org',
      url: 'https://vuejs.org/guide/introduction',
    },
  ])('$name rewrites to .md', ({ factory, hostname, url }) => {
    const rule = factory()
    expect(patternsMatchHostname(rule, hostname)).toBe(true)
    const result = rewrite(rule, url)
    expect(result?.href).toBe(`${url}.md`)
  })
})

describe('appendMdWithIndex', () => {
  test.each([
    {
      name: 'astral',
      factory: rules.astral,
      hostname: 'docs.astral.sh',
      url: 'https://docs.astral.sh/ruff/configuration',
      trailingSlashUrl: 'https://docs.astral.sh/ruff/',
    },
    {
      name: 'openclaw',
      factory: rules.openclaw,
      hostname: 'docs.openclaw.ai',
      url: 'https://docs.openclaw.ai/getting-started',
      trailingSlashUrl: 'https://docs.openclaw.ai/docs/',
    },
    {
      name: 'rspack',
      factory: rules.rspack,
      hostname: 'rspack.rs',
      url: 'https://rspack.rs/guide',
      trailingSlashUrl: 'https://rspack.rs/guide/',
    },
    {
      name: 'tempo',
      factory: rules.tempo,
      hostname: 'docs.tempo.xyz',
      url: 'https://docs.tempo.xyz/getting-started',
      trailingSlashUrl: 'https://docs.tempo.xyz/docs/',
    },
    {
      name: 'viem',
      factory: rules.viem,
      hostname: 'viem.sh',
      url: 'https://viem.sh/docs/actions',
      trailingSlashUrl: 'https://viem.sh/docs/',
    },
    {
      name: 'wagmi',
      factory: rules.wagmi,
      hostname: 'wagmi.sh',
      url: 'https://wagmi.sh/react/getting-started',
      trailingSlashUrl: 'https://wagmi.sh/react/',
    },
  ])('$name rewrites path to .md', ({ factory, hostname, url }) => {
    const rule = factory()
    expect(patternsMatchHostname(rule, hostname)).toBe(true)
    const result = rewrite(rule, url)
    expect(result?.href).toBe(`${url}.md`)
  })

  test.each([
    { name: 'astral', factory: rules.astral, url: 'https://docs.astral.sh/ruff/' },
    { name: 'openclaw', factory: rules.openclaw, url: 'https://docs.openclaw.ai/docs/' },
    { name: 'rspack', factory: rules.rspack, url: 'https://rspack.rs/guide/' },
    { name: 'tempo', factory: rules.tempo, url: 'https://docs.tempo.xyz/docs/' },
    { name: 'viem', factory: rules.viem, url: 'https://viem.sh/docs/' },
    { name: 'wagmi', factory: rules.wagmi, url: 'https://wagmi.sh/react/' },
  ])('$name rewrites trailing slash to index.md', ({ factory, url }) => {
    const result = rewrite(factory(), url)
    expect(result?.href).toBe(`${url}index.md`)
  })
})

describe('appendIndexMd', () => {
  test('cloudflare appends /index.md', () => {
    const rule = rules.cloudflare()
    expect(patternsMatchHostname(rule, 'developers.cloudflare.com')).toBe(true)
    const result = rewrite(rule, 'https://developers.cloudflare.com/workers')
    expect(result?.href).toBe('https://developers.cloudflare.com/workers/index.md')
  })

  test('cloudflare appends index.md to trailing slash', () => {
    const result = rewrite(rules.cloudflare(), 'https://developers.cloudflare.com/workers/')
    expect(result?.href).toBe('https://developers.cloudflare.com/workers/index.md')
  })
})

describe('prefixedWithIndex', () => {
  test.each([
    { name: 'bun', factory: rules.bun, hostname: 'bun.sh', url: 'https://bun.sh/docs/install' },
    {
      name: 'laravel',
      factory: rules.laravel,
      hostname: 'laravel.com',
      url: 'https://laravel.com/docs/routing',
    },
    {
      name: 'nextjs',
      factory: rules.nextjs,
      hostname: 'nextjs.org',
      url: 'https://nextjs.org/docs/app/building',
    },
    {
      name: 'nodejs',
      factory: rules.nodejs,
      hostname: 'nodejs.org',
      url: 'https://nodejs.org/docs/guides',
    },
    {
      name: 'planetscale',
      factory: rules.planetscale,
      hostname: 'planetscale.com',
      url: 'https://planetscale.com/docs/concepts',
    },
    {
      name: 'render',
      factory: rules.render,
      hostname: 'render.com',
      url: 'https://render.com/docs/deploys',
    },
    {
      name: 'vercel',
      factory: rules.vercel,
      hostname: 'vercel.com',
      url: 'https://vercel.com/docs/deployments',
    },
  ])('$name rewrites docs path to .md', ({ factory, hostname, url }) => {
    const rule = factory()
    expect(patternsMatchHostname(rule, hostname)).toBe(true)
    const result = rewrite(rule, url)
    expect(result?.href).toBe(`${url}.md`)
  })

  test('bun returns index.md at prefix root', () => {
    const result = rewrite(rules.bun(), 'https://bun.sh/docs')
    expect(result?.href).toBe('https://bun.sh/docs/index.md')
  })

  test('bun returns index.md at prefix root with trailing slash', () => {
    const result = rewrite(rules.bun(), 'https://bun.sh/docs/')
    expect(result?.href).toBe('https://bun.sh/docs/index.md')
  })

  test.each([
    { name: 'bun', factory: rules.bun, url: 'https://bun.sh/blog/post' },
    { name: 'laravel', factory: rules.laravel, url: 'https://laravel.com/partners' },
    { name: 'nextjs', factory: rules.nextjs, url: 'https://nextjs.org/blog' },
    { name: 'vercel', factory: rules.vercel, url: 'https://vercel.com/pricing' },
  ])('$name returns undefined outside prefix', ({ factory, url }) => {
    const result = rewrite(factory(), url)
    expect(result).toBeUndefined()
  })
})

describe('repo', () => {
  test('deno rewrites to raw.githubusercontent.com', () => {
    const rule = rules.deno()
    expect(patternsMatchHostname(rule, 'docs.deno.com')).toBe(true)
    const result = rewrite(rule, 'https://docs.deno.com/runtime/fundamentals')
    expect(result?.href).toBe(
      'https://raw.githubusercontent.com/denoland/docs/main/runtime/fundamentals.md',
    )
  })

  test('deno returns undefined for root', () => {
    const result = rewrite(rules.deno(), 'https://docs.deno.com/')
    expect(result).toBeUndefined()
  })

  test('rolldown rewrites to raw.githubusercontent.com with prefix', () => {
    const rule = rules.rolldown()
    expect(patternsMatchHostname(rule, 'rolldown.rs')).toBe(true)
    const result = rewrite(rule, 'https://rolldown.rs/guide/introduction')
    expect(result?.href).toBe(
      'https://raw.githubusercontent.com/rolldown/rolldown/main/docs/guide/introduction.md',
    )
  })

  test('vitePlus rewrites to raw.githubusercontent.com with prefix', () => {
    const rule = rules.vitePlus()
    expect(patternsMatchHostname(rule, 'viteplus.dev')).toBe(true)
    const result = rewrite(rule, 'https://viteplus.dev/guide/install')
    expect(result?.href).toBe(
      'https://raw.githubusercontent.com/voidzero-dev/vite-plus/main/docs/guide/install.md',
    )
  })
})

describe('oxc', () => {
  test('rewrites .html path to raw.githubusercontent.com', () => {
    const rule = rules.oxc()
    expect(patternsMatchHostname(rule, 'oxc.rs')).toBe(true)
    const result = rewrite(rule, 'https://oxc.rs/docs/guide/usage/linter/config.html')
    expect(result?.href).toBe(
      'https://raw.githubusercontent.com/oxc-project/website/main/src/docs/guide/usage/linter/config.md',
    )
  })

  test('returns undefined for root', () => {
    const result = rewrite(rules.oxc(), 'https://oxc.rs/')
    expect(result).toBeUndefined()
  })
})

describe('reactDev', () => {
  test('rewrites path to .md', () => {
    const rule = rules.reactDev()
    expect(patternsMatchHostname(rule, 'react.dev')).toBe(true)
    const result = rewrite(rule, 'https://react.dev/reference/react')
    expect(result?.href).toBe('https://react.dev/reference/react.md')
  })

  test('returns undefined for root /', () => {
    const result = rewrite(rules.reactDev(), 'https://react.dev/')
    expect(result).toBeUndefined()
  })

  test('returns undefined for empty pathname', () => {
    const url = new URL('https://react.dev')
    url.pathname = ''
    const result = rules.reactDev().rewrite?.(url, {} as URLPatternResult)
    expect(result).toBeUndefined()
  })
})
