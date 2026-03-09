import { describe, expect, test } from 'vitest'
import * as rules from './rules.ts'

describe('appendMd', () => {
  test('aiSdk rewrites to .md', () => {
    const rule = rules.aiSdk()
    expect(rule.patterns).toContain('ai-sdk.dev')
    const result = rule.rewrite?.(
      new URL('https://ai-sdk.dev/docs/getting-started'),
    )
    expect(result?.href).toBe('https://ai-sdk.dev/docs/getting-started.md')
  })

  test('anthropic rewrites to .md', () => {
    const rule = rules.anthropic()
    expect(rule.patterns).toContain('docs.anthropic.com')
    const result = rule.rewrite?.(
      new URL('https://docs.anthropic.com/en/docs/overview'),
    )
    expect(result?.href).toBe('https://docs.anthropic.com/en/docs/overview.md')
  })

  test('claudeCode rewrites to .md', () => {
    const rule = rules.claudeCode()
    expect(rule.patterns).toContain('code.claude.com')
    const result = rule.rewrite?.(
      new URL('https://code.claude.com/docs/overview'),
    )
    expect(result?.href).toBe('https://code.claude.com/docs/overview.md')
  })

  test('openai rewrites to .md', () => {
    const rule = rules.openai()
    expect(rule.patterns).toContain('developers.openai.com')
    const result = rule.rewrite?.(
      new URL('https://developers.openai.com/docs/api'),
    )
    expect(result?.href).toBe('https://developers.openai.com/docs/api.md')
  })

  test('rolldown rewrites to .md', () => {
    const rule = rules.rolldown()
    expect(rule.patterns).toContain('rolldown.rs')
    const result = rule.rewrite?.(
      new URL('https://rolldown.rs/guide/introduction'),
    )
    expect(result?.href).toBe('https://rolldown.rs/guide/introduction.md')
  })

  test('routerVue rewrites to .md', () => {
    const rule = rules.routerVue()
    expect(rule.patterns).toContain('router.vuejs.org')
    const result = rule.rewrite?.(new URL('https://router.vuejs.org/guide'))
    expect(result?.href).toBe('https://router.vuejs.org/guide.md')
  })

  test('shadcn rewrites to .md', () => {
    const rule = rules.shadcn()
    expect(rule.patterns).toContain('ui.shadcn.com')
    const result = rule.rewrite?.(
      new URL('https://ui.shadcn.com/docs/components/button'),
    )
    expect(result?.href).toBe('https://ui.shadcn.com/docs/components/button.md')
  })

  test('stripe rewrites to .md', () => {
    const rule = rules.stripe()
    expect(rule.patterns).toContain('docs.stripe.com')
    const result = rule.rewrite?.(new URL('https://docs.stripe.com/payments'))
    expect(result?.href).toBe('https://docs.stripe.com/payments.md')
  })

  test('tanstack rewrites to .md', () => {
    const rule = rules.tanstack()
    expect(rule.patterns).toContain('tanstack.com')
    const result = rule.rewrite?.(
      new URL('https://tanstack.com/query/latest/docs/overview'),
    )
    expect(result?.href).toBe(
      'https://tanstack.com/query/latest/docs/overview.md',
    )
  })

  test('turbo rewrites to .md', () => {
    const rule = rules.turbo()
    expect(rule.patterns).toContain('turbo.build')
    const result = rule.rewrite?.(new URL('https://turbo.build/repo/docs'))
    expect(result?.href).toBe('https://turbo.build/repo/docs.md')
  })

  test('vite rewrites to .md', () => {
    const rule = rules.vite()
    expect(rule.patterns).toContain('vitejs.dev')
    const result = rule.rewrite?.(new URL('https://vitejs.dev/guide'))
    expect(result?.href).toBe('https://vitejs.dev/guide.md')
  })

  test('vitest rewrites to .md', () => {
    const rule = rules.vitest()
    expect(rule.patterns).toContain('vitest.dev')
    const result = rule.rewrite?.(new URL('https://vitest.dev/guide'))
    expect(result?.href).toBe('https://vitest.dev/guide.md')
  })

  test('vue rewrites to .md', () => {
    const rule = rules.vue()
    expect(rule.patterns).toContain('vuejs.org')
    const result = rule.rewrite?.(
      new URL('https://vuejs.org/guide/introduction'),
    )
    expect(result?.href).toBe('https://vuejs.org/guide/introduction.md')
  })
})

describe('appendMdWithIndex', () => {
  test('astral rewrites path to .md', () => {
    const rule = rules.astral()
    expect(rule.patterns).toContain('docs.astral.sh')
    const result = rule.rewrite?.(
      new URL('https://docs.astral.sh/ruff/configuration'),
    )
    expect(result?.href).toBe('https://docs.astral.sh/ruff/configuration.md')
  })

  test('astral rewrites trailing slash to index.md', () => {
    const result = rules
      .astral()
      .rewrite?.(new URL('https://docs.astral.sh/ruff/'))
    expect(result?.href).toBe('https://docs.astral.sh/ruff/index.md')
  })

  test('openclaw rewrites path to .md', () => {
    const rule = rules.openclaw()
    expect(rule.patterns).toContain('docs.openclaw.ai')
    const result = rule.rewrite?.(
      new URL('https://docs.openclaw.ai/getting-started'),
    )
    expect(result?.href).toBe('https://docs.openclaw.ai/getting-started.md')
  })

  test('openclaw rewrites trailing slash to index.md', () => {
    const result = rules
      .openclaw()
      .rewrite?.(new URL('https://docs.openclaw.ai/docs/'))
    expect(result?.href).toBe('https://docs.openclaw.ai/docs/index.md')
  })

  test('rspack rewrites path to .md', () => {
    const rule = rules.rspack()
    expect(rule.patterns).toContain('rspack.rs')
    const result = rule.rewrite?.(new URL('https://rspack.rs/guide'))
    expect(result?.href).toBe('https://rspack.rs/guide.md')
  })

  test('rspack rewrites trailing slash to index.md', () => {
    const result = rules.rspack().rewrite?.(new URL('https://rspack.rs/guide/'))
    expect(result?.href).toBe('https://rspack.rs/guide/index.md')
  })

  test('tempo rewrites path to .md', () => {
    const rule = rules.tempo()
    expect(rule.patterns).toContain('docs.tempo.xyz')
    const result = rule.rewrite?.(
      new URL('https://docs.tempo.xyz/getting-started'),
    )
    expect(result?.href).toBe('https://docs.tempo.xyz/getting-started.md')
  })

  test('tempo rewrites trailing slash to index.md', () => {
    const result = rules
      .tempo()
      .rewrite?.(new URL('https://docs.tempo.xyz/docs/'))
    expect(result?.href).toBe('https://docs.tempo.xyz/docs/index.md')
  })

  test('viem rewrites path to .md', () => {
    const rule = rules.viem()
    expect(rule.patterns).toContain('viem.sh')
    const result = rule.rewrite?.(new URL('https://viem.sh/docs/actions'))
    expect(result?.href).toBe('https://viem.sh/docs/actions.md')
  })

  test('viem rewrites trailing slash to index.md', () => {
    const result = rules.viem().rewrite?.(new URL('https://viem.sh/docs/'))
    expect(result?.href).toBe('https://viem.sh/docs/index.md')
  })

  test('wagmi rewrites path to .md', () => {
    const rule = rules.wagmi()
    expect(rule.patterns).toContain('wagmi.sh')
    const result = rule.rewrite?.(
      new URL('https://wagmi.sh/react/getting-started'),
    )
    expect(result?.href).toBe('https://wagmi.sh/react/getting-started.md')
  })

  test('wagmi rewrites trailing slash to index.md', () => {
    const result = rules.wagmi().rewrite?.(new URL('https://wagmi.sh/react/'))
    expect(result?.href).toBe('https://wagmi.sh/react/index.md')
  })
})

describe('appendIndexMd', () => {
  test('cloudflare appends /index.md', () => {
    const rule = rules.cloudflare()
    expect(rule.patterns).toContain('developers.cloudflare.com')
    const result = rule.rewrite?.(
      new URL('https://developers.cloudflare.com/workers'),
    )
    expect(result?.href).toBe(
      'https://developers.cloudflare.com/workers/index.md',
    )
  })

  test('cloudflare appends index.md to trailing slash', () => {
    const result = rules
      .cloudflare()
      .rewrite?.(new URL('https://developers.cloudflare.com/workers/'))
    expect(result?.href).toBe(
      'https://developers.cloudflare.com/workers/index.md',
    )
  })
})

describe('prefixedWithIndex', () => {
  test('bun rewrites docs path to .md', () => {
    const rule = rules.bun()
    expect(rule.patterns).toContain('bun.sh')
    const result = rule.rewrite?.(new URL('https://bun.sh/docs/install'))
    expect(result?.href).toBe('https://bun.sh/docs/install.md')
  })

  test('bun returns index.md at prefix root', () => {
    const result = rules.bun().rewrite?.(new URL('https://bun.sh/docs'))
    expect(result?.href).toBe('https://bun.sh/docs/index.md')
  })

  test('bun returns index.md at prefix root with trailing slash', () => {
    const result = rules.bun().rewrite?.(new URL('https://bun.sh/docs/'))
    expect(result?.href).toBe('https://bun.sh/docs/index.md')
  })

  test('bun returns undefined outside prefix', () => {
    const result = rules.bun().rewrite?.(new URL('https://bun.sh/blog/post'))
    expect(result).toBeUndefined()
  })

  test('laravel rewrites docs path to .md', () => {
    const rule = rules.laravel()
    expect(rule.patterns).toContain('laravel.com')
    const result = rule.rewrite?.(new URL('https://laravel.com/docs/routing'))
    expect(result?.href).toBe('https://laravel.com/docs/routing.md')
  })

  test('laravel returns undefined outside prefix', () => {
    const result = rules
      .laravel()
      .rewrite?.(new URL('https://laravel.com/partners'))
    expect(result).toBeUndefined()
  })

  test('nextjs rewrites docs path to .md', () => {
    const rule = rules.nextjs()
    expect(rule.patterns).toContain('nextjs.org')
    const result = rule.rewrite?.(
      new URL('https://nextjs.org/docs/app/building'),
    )
    expect(result?.href).toBe('https://nextjs.org/docs/app/building.md')
  })

  test('nextjs returns undefined outside prefix', () => {
    const result = rules.nextjs().rewrite?.(new URL('https://nextjs.org/blog'))
    expect(result).toBeUndefined()
  })

  test('nodejs rewrites docs path to .md', () => {
    const rule = rules.nodejs()
    expect(rule.patterns).toContain('nodejs.org')
    const result = rule.rewrite?.(new URL('https://nodejs.org/docs/guides'))
    expect(result?.href).toBe('https://nodejs.org/docs/guides.md')
  })

  test('planetscale rewrites docs path to .md', () => {
    const rule = rules.planetscale()
    expect(rule.patterns).toContain('planetscale.com')
    const result = rule.rewrite?.(
      new URL('https://planetscale.com/docs/concepts'),
    )
    expect(result?.href).toBe('https://planetscale.com/docs/concepts.md')
  })

  test('render rewrites docs path to .md', () => {
    const rule = rules.render()
    expect(rule.patterns).toContain('render.com')
    const result = rule.rewrite?.(new URL('https://render.com/docs/deploys'))
    expect(result?.href).toBe('https://render.com/docs/deploys.md')
  })

  test('vercel rewrites docs path to .md', () => {
    const rule = rules.vercel()
    expect(rule.patterns).toContain('vercel.com')
    const result = rule.rewrite?.(
      new URL('https://vercel.com/docs/deployments'),
    )
    expect(result?.href).toBe('https://vercel.com/docs/deployments.md')
  })

  test('vercel returns undefined outside prefix', () => {
    const result = rules
      .vercel()
      .rewrite?.(new URL('https://vercel.com/pricing'))
    expect(result).toBeUndefined()
  })
})

describe('repo', () => {
  test('deno rewrites to raw.githubusercontent.com', () => {
    const rule = rules.deno()
    expect(rule.patterns).toContain('docs.deno.com')
    const result = rule.rewrite?.(
      new URL('https://docs.deno.com/runtime/fundamentals'),
    )
    expect(result?.href).toBe(
      'https://raw.githubusercontent.com/denoland/docs/main/runtime/fundamentals.md',
    )
  })

  test('deno returns undefined for root', () => {
    const result = rules.deno().rewrite?.(new URL('https://docs.deno.com/'))
    expect(result).toBeUndefined()
  })

  test('hono rewrites to raw.githubusercontent.com', () => {
    const rule = rules.hono()
    expect(rule.patterns).toContain('hono.dev')
    const result = rule.rewrite?.(
      new URL('https://hono.dev/docs/getting-started'),
    )
    expect(result?.href).toBe(
      'https://raw.githubusercontent.com/honojs/website/main/docs/getting-started.md',
    )
  })

  test('hono returns undefined for root', () => {
    const result = rules.hono().rewrite?.(new URL('https://hono.dev/'))
    expect(result).toBeUndefined()
  })
})

describe('reactDev', () => {
  test('rewrites path to .md', () => {
    const rule = rules.reactDev()
    expect(rule.patterns).toContain('react.dev')
    const result = rule.rewrite?.(new URL('https://react.dev/reference/react'))
    expect(result?.href).toBe('https://react.dev/reference/react.md')
  })

  test('returns undefined for root /', () => {
    const result = rules.reactDev().rewrite?.(new URL('https://react.dev/'))
    expect(result).toBeUndefined()
  })

  test('returns undefined for empty pathname', () => {
    const url = new URL('https://react.dev')
    url.pathname = ''
    const result = rules.reactDev().rewrite?.(url)
    expect(result).toBeUndefined()
  })
})
