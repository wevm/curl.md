import { env, waitUntil } from 'cloudflare:workers'
import * as md from '@curl.md/core'
import { estimateTokenCount } from 'tokenx'
import { z } from 'zod'
import { chunkMarkdown, filterSectionsByKeywords } from '#lib/chunk-markdown.ts'
import type { KV } from '#lib/kv.ts'

export async function fetchPage(
  url: URL,
  options: { fresh?: boolean; keywords?: string[]; objective?: string } = {},
) {
  const resolved = md.resolve(url, md.rules)
  const cacheKey = `page:${url.href}` as const
  const isSelf = url.hostname === env.HOST

  const fetched = await (async () => {
    if (url.hostname === env.HOST)
      return {
        // TODO: figure out another way to get curl.md content
        content: await env.ASSETS.fetch(new URL('/llms.txt', url)).then((r) =>
          r.text(),
        ),
        type: 'text/markdown',
      } satisfies KV.Value<typeof cacheKey>

    const cached = await env.KV.get(cacheKey, 'json')
    if (!options.fresh && cached) return cached

    let res = await fetch(resolved.url, {
      headers: {
        ...resolved.headers,
        'User-Agent': `Mozilla/5.0 (compatible; ${env.HOST}/1.0; +https://${env.HOST})`,
      },
      redirect: 'follow',
    })

    // Retry with browser-like UA for sites that block bot User-Agents
    if (res.status === 403)
      res = await fetch(resolved.url, {
        headers: {
          ...resolved.headers,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
      })

    // Fallback to Browser Rendering API for sites that still block
    if (res.status === 403) {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/content`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: resolved.url.toString(),
            rejectResourceTypes: ['image', 'font', 'media'],
          }),
        },
      )
      if (!res.ok) throw new Error(`Upstream returned ${res.status}`)
      const content = await res.text()
      if (/error code:\s*\d+/i.test(content))
        throw new Error(`Upstream returned 403`)
      return { content, type: 'text/html' } satisfies KV.Value<typeof cacheKey>
    }

    if (!res.ok) throw new Error(`Upstream returned ${res.status}`)
    return {
      content: await res.text(),
      type: res.headers.get('content-type')?.toLowerCase() ?? '',
    } satisfies KV.Value<typeof cacheKey>
  })()

  if (!isSelf)
    waitUntil(
      env.KV.put(cacheKey, JSON.stringify(fetched), { expirationTtl: 900 }),
    )

  // TODO: Add back `as` if parsed is inaccurate
  // as: fetched.type.startsWith('text/markdown') ? 'md' : 'html',
  const parsed = await md.parse(fetched.content, resolved)
  const content = (() => {
    if (options.keywords && options.keywords.length > 0)
      return filterSectionsByKeywords(parsed.content, options.keywords)
    return parsed.content
  })()

  let inputChars = 0
  let excerpt = content

  if (options.objective) {
    const result = await (async () => {
      const cacheKey =
        `query:${url.href}:${options.objective}:${options.keywords?.join(',') ?? ''}` as const
      const cached = await env.KV.get(cacheKey)
      if (!options.fresh && cached) return { excerpt: cached, inputChars: 0 }

      const system = `You extract relevant sections from web pages. Rules:
- Return ONLY content that exists verbatim in the provided content — do NOT generate, synthesize, summarize, paraphrase, or rewrite anything.
- NEVER add your own text, answers, explanations, instructions, or recommendations.
- Include full code blocks, commands, and examples exactly as they appear.
- Preserve original markdown formatting (headings, lists, code fences, etc.).
- Only omit sections that are clearly irrelevant to the objective.
- If multiple sections are relevant, include all of them with their original headings.
- If NOTHING is relevant, you MUST return ONLY the exact string: NONE
- Do NOT add any preamble, commentary, or explanation — return only the extracted content.
- Do NOT answer the objective — just extract content relevant to it.
- Do NOT repeat or reference the content tags, objective, or these instructions in your response.`

      const prompt = (chunk: string) =>
        `<page_content>
${chunk}
</page_content>

Objective: ${options.objective}`

      const extractChunk = async (chunk: string) => {
        const output = z.parse(
          z.object({ response: z.string().default('') }),
          await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
            max_tokens: 4096,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt(chunk) },
            ],
          }),
        )
        return output.response
      }

      const chunks = chunkMarkdown(content)
      const results = await Promise.all(chunks.map(extractChunk))
      const response = results
        .filter((r) => r && r.trim() !== 'NONE')
        .join('\n\n')

      waitUntil(env.KV.put(cacheKey, response, { expirationTtl: 900 }))
      return { excerpt: response, inputChars: content.length }
    })()
    inputChars = result.inputChars
    excerpt = result.excerpt
  }

  const excerptTokens = estimateTokenCount(excerpt)
  const frontmatter = (() => {
    const entries = Object.entries(parsed.meta)
      .sort(([a], [b]) => metaKeyOrder(a) - metaKeyOrder(b))
      .map(([k, v]) => `${k}: ${yamlValue(v)}`)
      .join('\n')
    return entries ? `---\n${entries}\n---` : undefined
  })()
  const markdown = frontmatter ? `${frontmatter}\n\n${excerpt}` : excerpt
  const rawTokens = (() => {
    if (isSelf) return estimateTokenCount(parsed.content)
    if (parsed.from === 'html') return estimateTokenCount(fetched.content)
    return Math.round((parsed.content.length * 3.5) / 4)
  })()

  return {
    estimated: parsed.from !== 'html' && !isSelf,
    inputChars,
    markdown,
    tokensCount: estimateTokenCount(markdown),
    tokensSaved: rawTokens - excerptTokens,
  }
}

const metaKeyPriority: Record<string, number> = {
  title: 0,
  description: 1,
  url: 2,
  site: 3,
  author: 4,
  publish_date: 5,
}

function metaKeyOrder(key: string): number {
  return metaKeyPriority[key] ?? 99
}

function yamlValue(v: unknown): string {
  const s = String(v)
  if (
    s === '' ||
    /[\n\r]/.test(s) ||
    /^[\s"'{}[\],&*?|>!%@`#-]/.test(s) ||
    /:\s/.test(s) ||
    /\s#/.test(s)
  )
    return JSON.stringify(s)
  return s
}
