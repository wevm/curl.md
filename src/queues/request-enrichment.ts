import { env } from 'cloudflare:workers'
import { estimateTokenCount } from 'tokenx'
import type { Database } from '#db/client.ts'

export async function processRequestEnrichmentMessage(
  message: Message<processRequestEnrichmentMessage.Body>,
  db: Database,
) {
  const response = await fetch(message.body.url, {
    headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${env.HOST}/1.0; +https://${env.HOST})` },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    if (response.status >= 500 || response.status === 408 || response.status === 429)
      throw new Error(`Request enrichment fetch failed with ${response.status}`)
    return
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return

  const sourceTokens = estimateTokenCount(await response.text())
  await db
    .updateTable('request')
    .set({ source_tokens: sourceTokens, source_tokens_method: 'html' })
    .where('id', '=', message.body.request_id)
    .where('source_tokens', '<', sourceTokens)
    .where('source_tokens_method', '=', 'estimated')
    .executeTakeFirst()
}

processRequestEnrichmentMessage.queueName = 'curl-request-enrichment' as const

export namespace processRequestEnrichmentMessage {
  export type Body = {
    request_id: string
    url: string
  }
}
