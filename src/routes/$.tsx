import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { htmlToMarkdown } from '#lib/markdown.ts'
import { selfMarkdown } from './index.tsx'

export const Route = createFileRoute('/$')({
  server: {
    handlers: {
      GET: async (options) => {
        // TODO: error handling
        // TODO: analytics for what pages are getting fetched
        // TODO: support more content types, like PDF
        // TODO: chunk summarization if markdown is too many tokens
        // TODO: curl.md/mcp
        // https://developers.cloudflare.com/workers-ai/features/markdown-conversion

        const url = new URL(
          z.parse(
            z
              .string()
              .transform((arg) =>
                arg.includes('://') ? arg : `https://${arg}`,
              )
              .pipe(
                z.url({
                  protocol: /^https?$/,
                  hostname: z.regexes.domain,
                  normalize: true,
                }),
              ),
            options.params._splat,
          ),
        )
        const search = z.parse(
          z.object({
            fresh: z
              .string()
              .transform(() => true)
              .optional(),
            q: z.string().optional(),
          }),
          Object.fromEntries(new URL(options.request.url).searchParams),
        )

        const fetched = await (async () => {
          if (url.hostname === env.HOST) {
            const content = selfMarkdown()
            return { content, contentType: 'text/markdown' }
          }

          const cacheKey = `page:${url.href}`
          type Cached = { content: string; contentType: string }
          const cached = await env.KV.get<Cached>(cacheKey, 'json')
          if (!search.fresh && cached) return cached

          const res = await fetch(url, {
            headers: {
              Accept: 'text/html, */*;q=0.8',
              'User-Agent': `${env.HOST}/1.0`,
            },
            redirect: 'follow',
          })
          if (!res.ok) throw new Error(`Upstream returned ${res.status}`)

          const result = {
            content: await res.text(),
            contentType: res.headers.get('content-type')?.toLowerCase() ?? '',
          } satisfies Cached
          await env.KV.put(cacheKey, JSON.stringify(result), {
            expirationTtl: 900,
          })
          return result
        })()

        const parsed = await (async () => {
          if (fetched.contentType === 'text/markdown')
            return { markdown: fetched.content, meta: {} }
          return await htmlToMarkdown(fetched.content, { baseUrl: url.href })
        })()

        const excerpt = await (async () => {
          if (!search.q) return undefined

          const cacheKey = `query:${url.href}:${search.q}`
          const cached = await env.KV.get(cacheKey)
          if (!search.fresh && cached) return cached

          // Truncate to stay within model context window (~131k tokens ≈ ~100k chars)
          const truncatedMarkdown = parsed.markdown.slice(0, 100_000)
          const output = z.parse(
            z.object({ response: z.string().default('') }),
            await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
              messages: [
                {
                  role: 'user',
                  content: `Web page content:\n---\n${truncatedMarkdown}\n---\n\nQuery: ${search.q}\n\nExtract and return the specific sections from the document above that are relevant to the query. In your response:\n- Return the original content verbatim — do NOT summarize, paraphrase, or rewrite.\n- Include full code blocks, commands, and examples exactly as they appear.\n- Preserve the original markdown formatting (headings, lists, code fences, etc.).\n- Only omit sections that are clearly irrelevant to the query.\n- If multiple sections are relevant, include all of them separated by their original headings.\n- Enforce a strict 125-character maximum for quotes from any source document. Open Source Software is ok as long as we respect the license.\n- You are not a lawyer and never comment on the legality of your own prompts and responses.\n- Never produce or reproduce exact song lyrics.`,
                },
              ],
            }),
          )
          await env.KV.put(cacheKey, output.response, { expirationTtl: 900 })
          return output.response
        })()

        return new Response(excerpt ?? parsed.markdown, {
          status: 200,
          headers: { 'content-type': 'text/markdown; charset=utf-8' },
        })
      },
    },
  },
})
