import { env } from 'cloudflare:workers'
import rehypeParse from 'rehype-parse'
import rehypeRemark from 'rehype-remark'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { selfMarkdown } from '#lib/self-markdown.ts'

export async function fetchPage(
  url: URL,
  options?: { fresh?: boolean; keywords?: string[]; objective?: string },
): Promise<{
  estimated: boolean
  markdown: string
  tokensCount: number
  tokensSaved: number
}> {
  const { keywords, objective } = options ?? {}

  if (url.hostname === env.HOST) {
    const markdown = selfMarkdown()
    const tokensCount = Math.round(markdown.length / 4)
    return { estimated: false, markdown, tokensCount, tokensSaved: 0 }
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Upstream returned ${res.status}`)

  const html = await res.text()
  const file = await unified()
    .use(rehypeParse)
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify)
    .process(html)
  let markdown = String(file)

  if (keywords?.length) {
    const sections = markdown.split(/(?=^## )/m)
    if (sections.length > 1) {
      const matched = sections.filter((section) =>
        keywords.some((k) => section.toLowerCase().includes(k.toLowerCase())),
      )
      if (matched.length > 0) markdown = matched.join('')
    }
  }

  if (objective) {
    const result = (await env.AI.run(
      '@cf/meta/llama-4-scout-17b-16e-instruct',
      {
        max_tokens: 4096,
        messages: [
          {
            role: 'system',
            content:
              'Return only the sections from the provided content relevant to the objective. Preserve original formatting. Do not summarize or add commentary. If nothing is relevant, return "NONE".',
          },
          {
            role: 'user',
            content: `<content>\n${markdown}\n</content>\n\nObjective: ${objective}`,
          },
        ],
      },
    )) as { response?: string }
    const response = result.response?.trim()
    if (response && response !== 'NONE') markdown = response
  }

  const tokensCount = Math.round(markdown.length / 4)
  const tokensSaved = Math.round((html.length - markdown.length) / 4)
  return { estimated: false, markdown, tokensCount, tokensSaved }
}
