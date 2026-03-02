import { env } from 'cloudflare:workers'
import type { Kysely } from 'kysely'
import type { DB } from '#lib/db.gen.ts'

export async function processRequestMessage(
  message: Message<processRequestMessage.Body>,
  db: Kysely<DB>,
) {
  const body = message.body

  // Insert request record
  await db
    .insertInto('request')
    .values({
      account_id: body.account_id,
      api_key_id: body.api_key_id,
      hostname: body.hostname,
      id: body.id,
      keywords: body.keywords,
      objective: body.objective,
      organization_id: body.organization_id,
      path: body.path,
      tokens_saved: body.tokens_saved,
      url: body.url,
      user_agent: body.user_agent,
    })
    .execute()

  // Update tokens_saved if estimated
  if (body.estimated) {
    const res = await fetch(body.url, {
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': `Mozilla/5.0 (compatible; ${env.HOST}/1.0; +https://${env.HOST})`,
      },
      redirect: 'follow',
    })
    if (res.ok) {
      const html = await res.text()
      const tokensSaved = Math.round((html.length - body.markdownLength) / 4)
      await db
        .updateTable('request')
        .set({ tokens_saved: tokensSaved })
        .where('id', '=', body.id)
        .execute()
    }
  }

  if (body.tokens_saved) await env.KV.delete('stats:tokens_saved')
}

processRequestMessage.queueName = 'curl-request' as const

export namespace processRequestMessage {
  export type Body = {
    account_id: string | null
    api_key_id: string | null
    estimated: boolean
    hostname: string
    id: string
    keywords: string | null
    markdownLength: number
    objective: string | null
    organization_id: string | null
    path: string
    tokens_saved: number | null
    url: string
    user_agent: string | undefined
  }
}
