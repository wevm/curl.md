import { z } from 'zod'
import { defineRule } from '../defineRule.ts'

export const githubDocs = defineRule({
  patterns: ['docs.github.com'],
  resolve: (url) => {
    const mdUrl = new URL(url.href)
    mdUrl.pathname = '/api/article'
    const firstSegment = url.pathname.split('/')[1]
    const pathname =
      firstSegment &&
      new Set(['cn', 'de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh']).has(
        firstSegment,
      )
        ? url.pathname
        : `/en${url.pathname}`
    mdUrl.searchParams.set('pathname', pathname)
    return mdUrl
  },
  parse: async (response) => {
    const json = z.parse(
      z.object({
        body: z.string().optional(),
        meta: z
          .object({
            intro: z.string().optional(),
            title: z.string().optional(),
          })
          .optional(),
      }),
      await response.json(),
    )
    return {
      content: json.body ?? JSON.stringify(json),
      meta: {
        ...(json.meta?.title && { title: json.meta.title }),
        ...(json.meta?.intro && { description: json.meta.intro }),
      },
    }
  },
})
