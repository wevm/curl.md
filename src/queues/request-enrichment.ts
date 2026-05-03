import { env } from 'cloudflare:workers'
import { estimateTokenCount } from 'tokenx'
import type { Database } from '#db/client.ts'

export async function processRequestEnrichmentMessage(
  message: Message<processRequestEnrichmentMessage.Body>,
  db: Database,
) {
  const body = message.body

  try {
    const response = await fetch(body.url, {
      headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${env.HOST}/1.0; +https://${env.HOST})` },
      redirect: 'follow',
    })
    if (!response.ok) return

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return

    const sourceTokens = estimateTokenCount(await response.text())
    await db
      .updateTable('request')
      .set({ source_tokens: sourceTokens, source_tokens_method: 'html' })
      .where('id', '=', body.request_id)
      .where('source_tokens', '<', sourceTokens)
      .where('source_tokens_method', '=', 'estimated')
      .executeTakeFirst()
  } catch {
    // Best-effort enrichment only; keep the fallback when the follow-up fetch fails.
  }
}

processRequestEnrichmentMessage.queueName = 'curl-request-enrichment' as const

export namespace processRequestEnrichmentMessage {
  export type Body = {
    request_id: string
    url: string
  }
}
