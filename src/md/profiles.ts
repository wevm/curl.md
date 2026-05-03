import { defineProfile } from './mod.ts'

export const docusaurus = defineProfile({
  checks: [{ url: 'https://docusaurus.io/docs' }],
  contentRootSelectors: ['.markdown', '.theme-doc-markdown'],
  detect: {
    generator: /^docusaurus\b/i,
    includesAny: {
      marker: 'dom:__docusaurus',
      needles: ['class="theme-doc-markdown', 'id=__docusaurus', 'name=docusaurus_locale'],
    },
  },
  key: 'docusaurus',
})

export const exdoc = defineProfile<{
  markdownRequest: { headers: Record<string, string>; url: string }
}>({
  checks: [{ url: 'https://hexdocs.pm/boombox/readme.html' }],
  contentRootSelectors: ['#content', '.content-inner'],
  detect: {
    generator: /^exdoc\b/i,
    includesAny: {
      marker: 'dom:sidebar-list-nav',
      needles: ['class="copy-markdown icon-action"', 'href="llms.txt"', 'id="sidebar-list-nav"'],
    },
  },
  key: 'exdoc',
  resolve: (url) => ({
    markdownRequest: { headers: { Accept: 'text/markdown' }, url: url.href },
  }),
})

// TODO: Probe Accept: text/markdown for detected Fumadocs sites when HTML extraction is thin.
export const fumadocs = defineProfile({
  contentRootSelectors: ['#nd-docs-layout', '#nd-flux-layout', '#nd-notebook-layout', '#nd-page'],
  detect: {
    includesAny: {
      marker: 'dom:nd-page',
      needles: [
        'id="nd-page"',
        'id="nd-docs-layout"',
        'id="nd-notebook-layout"',
        'id="nd-flux-layout"',
      ],
    },
  },
  key: 'fumadocs',
})

export const gitbook = defineProfile<{
  markdownRequest: { headers: Record<string, string>; url: string }
  normalize: (content: string) => string
}>({
  checks: [{ url: 'https://gitbook.com/docs/getting-started/quickstart' }],
  contentRootSelectors: ['.page-has-toc'],
  detect: {
    generator: /^gitbook\b/i,
    includesAny: {
      marker: 'dom:text-markdown-alternate',
      needles: ['type="text/markdown"', "type='text/markdown'"],
    },
  },
  key: 'gitbook',
  resolve: (url) => ({
    markdownRequest: { headers: { Accept: 'text/markdown' }, url: url.href },
    normalize(content) {
      return content.replace(
        /\n*---\r?\n\r?\n# Agent Instructions: Querying This Documentation[\s\S]*$/,
        '\n',
      )
    },
  }),
})

export const mintlify = defineProfile<{
  markdownRequest: { headers: Record<string, string>; url: string }
  normalize: (content: string) => string
}>({
  checks: [{ url: 'https://mintlify.com/docs' }],
  contentRootSelectors: ['#content-container', '#content-area'],
  detect: {
    generator: /^mintlify$/i,
    includesAny: {
      marker: 'dom:content-area',
      needles: ['id="content-area"', 'id="content-container"'],
    },
  },
  key: 'mintlify',
  resolve: (url) => ({
    markdownRequest: { headers: { Accept: 'text/markdown' }, url: url.href },
    normalize(content) {
      return content
        .replace(/\n*<AgentInstructions>\s*[\s\S]*?\s*<\/AgentInstructions>\n*/g, '\n')
        .replace(/\n*Built with \[Mintlify\]\([^)]*\)\.?\n*/g, '\n')
    },
  }),
})

export const mkdocs = defineProfile({
  checks: [{ url: 'https://www.mkdocs.org/user-guide/' }],
  contentRootSelectors: ['.col-md-9', '.md-content', '.md-content__inner'],
  detect: {
    includesAny: {
      marker: 'dom:mkdocs',
      needles: [
        'data-md-component="content"',
        'data-md-component=content',
        'id="mkdocs_search_modal"',
      ],
    },
  },
  key: 'mkdocs',
})

export const readTheDocs = defineProfile({
  checks: [{ url: 'https://docs.readthedocs.com/platform/' }],
  contentRootSelectors: ['.document', '.rst-content'],
  detect: {
    includesAny: {
      marker: 'dom:readthedocs',
      needles: ['class="rst-content"', 'class="wy-nav-content"', 'name="readthedocs-project-slug"'],
    },
  },
  key: 'readTheDocs',
})

export const rspress = defineProfile<{
  markdownRequest: { headers: Record<string, string>; url: string }
}>({
  checks: [{ url: 'https://rspress.rs/' }, { url: 'https://rspack.rs/guide/start/introduction' }],
  contentRootSelectors: [
    '.rp-doc-layout__doc-container',
    '.rp-home-feature',
    '.rp-home-hero',
    '.rspress-doc',
  ],
  detect: {
    generator: /^rspress\b/i,
    includesAny: {
      marker: 'dom:__rspress_root',
      needles: [
        'id="__rspress_root"',
        'id="__rspress_modal_container"',
        'class="rp-doc rspress-doc"',
        'class="rp-llms-button',
      ],
    },
  },
  key: 'rspress',
  resolve: (url) => ({
    markdownRequest: { headers: { Accept: 'text/markdown' }, url: url.href },
  }),
})

export const sphinx = defineProfile({
  checks: [{ url: 'https://docs.python.org/3/library/functions.html' }],
  contentRootSelectors: ['.body', '.bodywrapper', '.documentwrapper'],
  detect: {
    includesAny: {
      marker: 'dom:sphinx',
      needles: ['_static/doctools.js', 'class="sphinxsidebar"', 'data-content_root='],
    },
  },
  key: 'sphinx',
})

export const vitepress = defineProfile<{ markdownUrl: string }>({
  checks: [{ url: 'https://vitepress.dev/guide/what-is-vitepress' }],
  contentRootSelectors: ['#VPContent', '.VPContent', '.VPDoc', '.vp-doc'],
  detect: {
    generator: /^vitepress\b/i,
    includesAny: {
      marker: 'dom:VPContent',
      needles: ['id="VPContent"', 'class="VPContent', 'class="VPDoc', 'class="vp-doc'],
    },
  },
  key: 'vitepress',
  resolve(url) {
    const markdownUrl = new URL(url.href)
    markdownUrl.pathname = `${markdownUrl.pathname.replace(/\.html$/, '')}.md`
    markdownUrl.search = ''
    return { markdownUrl: markdownUrl.href }
  },
})

export const starlight = defineProfile({
  checks: [{ url: 'https://starlight.astro.build/getting-started' }],
  contentRootSelectors: ['.sl-markdown-content'],
  detect: {
    generator: /^starlight\b/i,
    includesAny: {
      marker: 'dom:starlight__sidebar',
      needles: ['id="starlight__sidebar"', 'class="sl-markdown-content"', '<starlight-tabs'],
    },
  },
  key: 'starlight',
})
