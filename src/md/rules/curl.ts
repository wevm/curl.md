import { defineRule } from '../mod.ts'

export const curlDocs = defineRule<{ fetch?: typeof globalThis.fetch }>({
  key: 'curlDocs',
  patterns: [
    new URLPattern({ hostname: 'curl.:tld(md|local)', pathname: '/docs' }),
    new URLPattern({ hostname: 'curl.:tld(md|local)', pathname: '/docs/:path+' }),
    new URLPattern({ hostname: '*.curl.:tld(md|local)', pathname: '/docs' }),
    new URLPattern({ hostname: '*.curl.:tld(md|local)', pathname: '/docs/:path+' }),
  ],
  checks: [
    {
      url: 'https://curl.md/docs/install',
      contains: ['# Installation', '## Plugins', 'curl -fsSL https://curl.md/install.sh | bash'],
    },
  ],
  rewrite(url) {
    if (url.pathname.endsWith('.md')) return url

    const path = url.pathname.replace(/^\/docs/, '')
    const pathname = path === '' || path === '/' ? '/index' : path.replace(/\/$/, '')
    return new URL(`https://${url.hostname}/docs${pathname}.md`)
  },
  async fetch(input, init, context) {
    return (context.options?.fetch ?? context.fetch)(input, init)
  },
})

export const curlMd = defineRule<{ fetch?: typeof globalThis.fetch }>({
  key: 'curlMd',
  patterns: [
    new URLPattern({ hostname: 'curl.:tld(md|local)' }),
    new URLPattern({ hostname: '*.curl.:tld(md|local)' }),
  ],
  async fetch(_, _init, context) {
    return (context.options?.fetch ?? context.fetch)('https://curl.md/llms.txt')
  },
})
