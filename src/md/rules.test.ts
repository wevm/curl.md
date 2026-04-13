import { expect, test, vi } from 'vitest'
import type { defineRule } from './mod.ts'
import * as rules from './rules.ts'

/** Call rewrite with a dummy match (these rules don't use match) */
function rewrite(factory: defineRule.ReturnType, url: string) {
  return factory().rewrite?.(new URL(url), {} as URLPatternResult)
}

function patternsMatch(rule: { patterns: URLPattern[] }, url: string) {
  return rule.patterns.some((pattern) => pattern.test(url))
}

function checkUrl(factory: defineRule.ReturnType) {
  const url = factory.checks?.[0]?.url
  if (!url) throw new Error(`Rule "${factory.key}" has no checks`)
  return url
}

test.each([
  rules.aiSdk,
  rules.anthropic,
  rules.claudeCode,
  rules.openai,
  rules.routerVue,
  rules.shadcn,
  rules.stripe,
  rules.turbo,
  rules.vite,
  rules.vitest,
  rules.vue,
])('appendMd: $key rewrites to .md', (factory) => {
  const url = checkUrl(factory)
  expect(patternsMatch(factory(), url)).toBe(true)
  expect(rewrite(factory, url)?.href).toBe(`${url}.md`)
})

test.each([rules.astral, rules.openclaw, rules.rspack, rules.tempo, rules.viem, rules.wagmi])(
  'appendMdWithIndex: $key rewrites path to .md',
  (factory) => {
    const url = checkUrl(factory)
    expect(patternsMatch(factory(), url)).toBe(true)
    expect(rewrite(factory, url)?.href).toBe(url.endsWith('/') ? `${url}index.md` : `${url}.md`)
  },
)

test.each([
  [rules.astral, 'https://docs.astral.sh/ruff/'],
  [rules.openclaw, 'https://docs.openclaw.ai/docs/'],
  [rules.rspack, 'https://rspack.rs/guide/'],
  [rules.tempo, 'https://docs.tempo.xyz/docs/'],
  [rules.viem, 'https://viem.sh/docs/'],
  [rules.wagmi, 'https://wagmi.sh/react/'],
] as const)('appendMdWithIndex: %s rewrites trailing slash to index.md', (factory, url) => {
  expect(rewrite(factory, url)?.href).toBe(`${url}index.md`)
})

test('cloudflare rewrites docs path to raw mdx', () => {
  expect(patternsMatch(rules.cloudflare(), 'https://developers.cloudflare.com/workers')).toBe(true)
  expect(rewrite(rules.cloudflare, 'https://developers.cloudflare.com/workers')?.href).toBe(
    'https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/workers.mdx',
  )
})

test('curlDocs rewrites docs root to raw GitHub docs index', () => {
  expect(patternsMatch(rules.curlDocs(), 'https://curl.md/docs')).toBe(true)
  expect(rewrite(rules.curlDocs, 'https://curl.md/docs')?.href).toBe(
    'https://raw.githubusercontent.com/wevm/curl.md/main/docs/index.mdx',
  )
})

test('curlDocs rewrites docs pages to raw GitHub docs mdx', () => {
  expect(
    patternsMatch(rules.curlDocs(), 'https://curl.local/docs/getting_started/installation'),
  ).toBe(true)
  expect(
    rewrite(rules.curlDocs, 'https://curl.local/docs/getting_started/installation')?.href,
  ).toBe(
    'https://raw.githubusercontent.com/wevm/curl.md/main/docs/getting_started/installation.mdx',
  )
})

test('curlDocs rewrites preview hosts to raw GitHub docs mdx', () => {
  expect(
    rewrite(rules.curlDocs, 'https://preview-123.curl.md/docs/getting_started/quick_start')?.href,
  ).toBe('https://raw.githubusercontent.com/wevm/curl.md/main/docs/getting_started/quick_start.mdx')
})

test('cloudflare keeps trailing slash paths on raw mdx candidate', () => {
  expect(rewrite(rules.cloudflare, 'https://developers.cloudflare.com/workers/')?.href).toBe(
    'https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/workers.mdx',
  )
})

test.each([
  rules.bun,
  rules.laravel,
  rules.nextjs,
  rules.nodejs,
  rules.planetscale,
  rules.render,
  rules.vercel,
])('prefixedWithIndex: $key rewrites docs path to .md', (factory) => {
  const url = checkUrl(factory)
  expect(patternsMatch(factory(), url)).toBe(true)
  expect(rewrite(factory, url)?.href).toBe(`${url}.md`)
})

test('prefixedWithIndex: bun returns index.md at prefix root', () => {
  expect(rewrite(rules.bun, 'https://bun.sh/docs')?.href).toBe('https://bun.sh/docs/index.md')
})

test('prefixedWithIndex: bun returns index.md at prefix root with trailing slash', () => {
  expect(rewrite(rules.bun, 'https://bun.sh/docs/')?.href).toBe('https://bun.sh/docs/index.md')
})

test.each([
  [rules.bun, 'https://bun.sh/blog/post'],
  [rules.laravel, 'https://laravel.com/partners'],
  [rules.nextjs, 'https://nextjs.org/blog'],
  [rules.vercel, 'https://vercel.com/pricing'],
] as const)('prefixedWithIndex: %s returns undefined outside prefix', (factory, url) => {
  expect(rewrite(factory, url)).toBeUndefined()
})

test('tanstack matches docs paths', () => {
  expect(patternsMatch(rules.tanstack(), 'https://tanstack.com/start/latest/docs')).toBe(true)
  expect(
    patternsMatch(
      rules.tanstack(),
      'https://tanstack.com/start/latest/docs/framework/react/overview',
    ),
  ).toBe(true)
})

test('tanstack does not match blog paths', () => {
  expect(patternsMatch(rules.tanstack(), 'https://tanstack.com/blog/react-server-components')).toBe(
    false,
  )
})

test('tanstack requests markdown for docs paths', async () => {
  const fetch = vi.fn(() => Promise.resolve(new Response('ok')))
  await rules
    .tanstack()
    .fetch?.(
      new URL('https://tanstack.com/start/latest/docs/framework/react/overview'),
      undefined,
      { fetch },
    )
  expect(fetch).toHaveBeenCalledWith(
    new URL('https://tanstack.com/start/latest/docs/framework/react/overview'),
    expect.objectContaining({ headers: { Accept: 'text/markdown' } }),
  )
})

test('repo: deno rewrites to raw.githubusercontent.com', () => {
  expect(patternsMatch(rules.deno(), 'https://docs.deno.com/runtime/fundamentals')).toBe(true)
  expect(rewrite(rules.deno, 'https://docs.deno.com/runtime/fundamentals')?.href).toBe(
    'https://raw.githubusercontent.com/denoland/docs/main/runtime/fundamentals.md',
  )
})

test('repo: deno returns undefined for root', () => {
  expect(rewrite(rules.deno, 'https://docs.deno.com/')).toBeUndefined()
})

test('repo: tanstackBlog rewrites blog posts to raw.githubusercontent.com', () => {
  expect(
    patternsMatch(rules.tanstackBlog(), 'https://tanstack.com/blog/react-server-components'),
  ).toBe(true)
  expect(
    rewrite(rules.tanstackBlog, 'https://tanstack.com/blog/react-server-components')?.href,
  ).toBe(
    'https://raw.githubusercontent.com/tanstack/tanstack.com/main/src/blog/react-server-components.md',
  )
})

test('repo: rolldown rewrites to raw.githubusercontent.com with prefix', () => {
  expect(patternsMatch(rules.rolldown(), 'https://rolldown.rs/guide/introduction')).toBe(true)
  expect(rewrite(rules.rolldown, 'https://rolldown.rs/guide/introduction')?.href).toBe(
    'https://raw.githubusercontent.com/rolldown/rolldown/main/docs/guide/introduction.md',
  )
})

test('repo: vitePlus rewrites to raw.githubusercontent.com with prefix', () => {
  expect(patternsMatch(rules.vitePlus(), 'https://viteplus.dev/guide/install')).toBe(true)
  expect(rewrite(rules.vitePlus, 'https://viteplus.dev/guide/install')?.href).toBe(
    'https://raw.githubusercontent.com/voidzero-dev/vite-plus/main/docs/guide/install.md',
  )
})

test('oxc rewrites .html path to raw.githubusercontent.com', () => {
  expect(patternsMatch(rules.oxc(), 'https://oxc.rs/docs/guide/usage/linter/config.html')).toBe(
    true,
  )
  expect(rewrite(rules.oxc, 'https://oxc.rs/docs/guide/usage/linter/config.html')?.href).toBe(
    'https://raw.githubusercontent.com/oxc-project/website/main/src/docs/guide/usage/linter/config.md',
  )
})

test('oxc returns undefined for root', () => {
  expect(rewrite(rules.oxc, 'https://oxc.rs/')).toBeUndefined()
})

test('reactDev rewrites path to .md', () => {
  expect(patternsMatch(rules.reactDev(), 'https://react.dev/reference/react')).toBe(true)
  expect(rewrite(rules.reactDev, 'https://react.dev/reference/react')?.href).toBe(
    'https://react.dev/reference/react.md',
  )
})

test('reactDev returns undefined for root /', () => {
  expect(rewrite(rules.reactDev, 'https://react.dev/')).toBeUndefined()
})

test('reactDev returns undefined for empty pathname', () => {
  const url = new URL('https://react.dev')
  url.pathname = ''
  expect(rules.reactDev().rewrite?.(url, {} as URLPatternResult)).toBeUndefined()
})
