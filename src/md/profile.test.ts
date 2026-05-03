import { expect, test } from 'vitest'
import { detectPageProfile } from './mod.ts'
import * as profiles from './profiles.ts'

test('detects docusaurus profile from generator and dom markers', () => {
  const result = detectPageProfile(
    '<!doctype html><html><head><meta name="generator" content="Docusaurus v3.10.1"><meta name=docusaurus_locale content=en></head><body><div id=__docusaurus><article class="theme-doc-markdown markdown"><h1>Docs</h1></article></div></body></html>',
    new URL('https://docusaurus.io/docs'),
    profiles,
  )

  expect(result).toEqual({
    contentRootSelectors: ['.markdown', '.theme-doc-markdown'],
    generator: 'Docusaurus v3.10.1',
    key: 'docusaurus',
    markers: ['meta:generator=Docusaurus v3.10.1', 'dom:__docusaurus'],
  })
})

test('detects exdoc profile from generator and docs chrome markers', () => {
  const result = detectPageProfile(
    '<!doctype html><html><head><meta name="generator" content="ExDoc v0.40.1"></head><body><nav><ul id="sidebar-list-nav"></ul></nav><main class="content" id="main"><div id="content" class="content-inner"><a href="readme.md" class="copy-markdown icon-action">Copy Markdown</a><h1>README</h1></div></main><footer><a href="llms.txt">View llms.txt</a></footer></body></html>',
    new URL('https://hexdocs.pm/boombox/readme.html'),
    profiles,
  )

  expect(result).toEqual({
    contentRootSelectors: ['#content', '.content-inner'],
    generator: 'ExDoc v0.40.1',
    key: 'exdoc',
    markdownRequest: {
      headers: { Accept: 'text/markdown' },
      url: 'https://hexdocs.pm/boombox/readme.html',
    },
    markers: ['meta:generator=ExDoc v0.40.1', 'dom:sidebar-list-nav'],
  })
})

test('detects fumadocs profile from dom markers', () => {
  const result = detectPageProfile(
    '<!doctype html><html><head><title>Docs</title></head><body><div id="nd-docs-layout"><article id="nd-page"><h1>Docs</h1></article></div></body></html>',
    new URL('https://example.com/docs'),
    profiles,
  )

  expect(result).toEqual({
    contentRootSelectors: ['#nd-docs-layout', '#nd-flux-layout', '#nd-notebook-layout', '#nd-page'],
    generator: undefined,
    key: 'fumadocs',
    markers: ['dom:nd-page'],
  })
})

test('detects gitbook profile from generator and markdown alternate link', () => {
  const result = detectPageProfile(
    '<!doctype html><html><head><meta name="generator" content="GitBook (0.0.0)"><link rel="alternate" type="text/markdown" href="https://gitbook.com/docs/getting-started/quickstart.md"></head><body><main class="page-has-toc"><h1>Docs</h1></main></body></html>',
    new URL('https://gitbook.com/docs/getting-started/quickstart'),
    profiles,
  )

  expect(result).toMatchObject({
    contentRootSelectors: ['.page-has-toc'],
    generator: 'GitBook (0.0.0)',
    key: 'gitbook',
    markdownRequest: {
      headers: { Accept: 'text/markdown' },
      url: 'https://gitbook.com/docs/getting-started/quickstart',
    },
    markers: ['meta:generator=GitBook (0.0.0)', 'dom:text-markdown-alternate'],
  })
  expect(result?.normalize).toEqual(expect.any(Function))
})

test('detects mkdocs profile from default theme markers', () => {
  const result = detectPageProfile(
    '<!doctype html><html><head><title>Docs</title></head><body><div class="container"><div class="col-md-9" role="main"><h1>Docs</h1></div></div><div id="mkdocs_search_modal"></div></body></html>',
    new URL('https://www.mkdocs.org/user-guide/'),
    profiles,
  )

  expect(result).toEqual({
    contentRootSelectors: ['.col-md-9', '.md-content', '.md-content__inner'],
    generator: undefined,
    key: 'mkdocs',
    markers: ['dom:mkdocs'],
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

test('detects read the docs profile before generic sphinx markers', () => {
  const result = detectPageProfile(
    '<!doctype html><html><head><meta name="readthedocs-project-slug" content="docs"></head><body><section class="wy-nav-content"><div class="rst-content"><h1>Docs</h1></div></section></body></html>',
    new URL('https://docs.readthedocs.com/platform/'),
    profiles,
  )

  expect(result).toEqual({
    contentRootSelectors: ['.document', '.rst-content'],
    generator: undefined,
    key: 'readTheDocs',
    markers: ['dom:readthedocs'],
  })
})

test('detects rspress profile from generator and dom markers', () => {
  const result = detectPageProfile(
    '<!doctype html><html><head><meta name="generator" content="Rspress v2.0.10"></head><body><div id="__rspress_root"><main class="rp-doc-layout__doc-container"><div class="rp-doc rspress-doc"><div class="rp-llms-button">Copy Markdown</div><h1>Docs</h1></div></main></div><div id="__rspress_modal_container"></div></body></html>',
    new URL('https://rspress.rs/guide/start/introduction'),
    profiles,
  )

  expect(result).toEqual({
    contentRootSelectors: [
      '.rp-doc-layout__doc-container',
      '.rp-home-feature',
      '.rp-home-hero',
      '.rspress-doc',
    ],
    generator: 'Rspress v2.0.10',
    key: 'rspress',
    markdownRequest: {
      headers: { Accept: 'text/markdown' },
      url: 'https://rspress.rs/guide/start/introduction',
    },
    markers: ['meta:generator=Rspress v2.0.10', 'dom:__rspress_root'],
  })
})

test('detects sphinx profile from classic theme markers', () => {
  const result = detectPageProfile(
    '<!doctype html><html data-content_root="../"><head><title>Docs</title><script src="../_static/doctools.js"></script></head><body><div class="documentwrapper"><div class="bodywrapper"><div class="body"><h1>Docs</h1></div></div></div><div class="sphinxsidebar"></div></body></html>',
    new URL('https://docs.python.org/3/library/functions.html'),
    profiles,
  )

  expect(result).toEqual({
    contentRootSelectors: ['.body', '.bodywrapper', '.documentwrapper'],
    generator: undefined,
    key: 'sphinx',
    markers: ['dom:sphinx'],
  })
})

test('detects starlight profile from dom markers', () => {
  const result = detectPageProfile(
    '<!doctype html><html><head><title>Docs</title></head><body><nav><div id="starlight__sidebar"></div></nav><main><div class="sl-markdown-content"><h1>Docs</h1></div></main></body></html>',
    new URL('https://starlight.astro.build/getting-started'),
    profiles,
  )

  expect(result).toEqual({
    contentRootSelectors: ['.sl-markdown-content'],
    generator: undefined,
    key: 'starlight',
    markers: ['dom:starlight__sidebar'],
  })
})

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

test('returns undefined for pages without supported framework markers', () => {
  expect(
    detectPageProfile(
      '<!doctype html><html><head><meta name="generator" content="WordPress 6.8"></head><body><main><h1>Hello</h1></main></body></html>',
      new URL('https://example.com/post'),
      profiles,
    ),
  ).toBeUndefined()
})
