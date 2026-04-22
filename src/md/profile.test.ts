import { expect, test } from 'vitest'
import { detectPageProfile } from './mod.ts'
import * as profiles from './profiles.ts'

test('detects vitepress profile from generator and dom markers', () => {
  const result = detectPageProfile(
    '<!doctype html><html><head><meta name="generator" content="VitePress v2.0.0-alpha.17"></head><body><div id="VPContent"><div class="VPDoc"><main class="vp-doc"><h1>Docs</h1></main></div></div></body></html>',
    new URL('https://vitepress.dev/guide/what-is-vitepress'),
    profiles,
  )

  expect(result).toEqual({
    contentRootSelectors: ['#VPContent', '.VPContent', '.VPDoc', '.vp-doc'],
    generator: 'VitePress v2.0.0-alpha.17',
    key: 'vitepress',
    markdownUrl: 'https://vitepress.dev/guide/what-is-vitepress.md',
    markers: ['meta:generator=VitePress v2.0.0-alpha.17', 'dom:VPContent'],
  })
})

test('detects mintlify profile from generator and dom markers', () => {
  const result = detectPageProfile(
    '<!doctype html><html><head><meta name="generator" content="Mintlify"></head><body><div id="content-container"><div id="content-area"><h1>Docs</h1></div></div></body></html>',
    new URL('https://mintlify.com/docs'),
    profiles,
  )

  expect(result).toMatchObject({
    contentRootSelectors: ['#content-container', '#content-area'],
    generator: 'Mintlify',
    key: 'mintlify',
    markdownRequest: {
      headers: { Accept: 'text/markdown' },
      url: 'https://mintlify.com/docs',
    },
    markers: ['meta:generator=Mintlify', 'dom:content-area'],
  })
  expect(result?.normalize).toEqual(expect.any(Function))
})

test('returns undefined for pages without supported framework markers', () => {
  expect(
    detectPageProfile(
      '<!doctype html><html><head><meta name="generator" content="WordPress 6.8"></head><body><main><h1>Hello</h1></main></body></html>',
      new URL('https://example.com/post'),
      profiles,
    ),
  ).toBeUndefined()
})
