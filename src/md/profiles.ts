import { defineProfile } from './mod.ts'

export const mintlify = defineProfile<{
  markdownRequest: { headers: Record<string, string>; url: string }
  normalize: (content: string) => string
}>({
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
      return content.replace(/\n*Built with \[Mintlify\]\([^)]*\)\.?\n*/g, '\n')
    },
  }),
})

export const vitepress = defineProfile<{ markdownUrl: string }>({
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
