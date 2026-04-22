import { defineProfile } from './mod.ts'

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
