import { env } from 'cloudflare:workers'
import { getDb } from '#lib/db.ts'

export async function processRequestMessage(
  message: Message<Parameters<Env['REQUEST_QUEUE']['send']>[0]>,
) {
  const db = getDb()
  const body = message.body

  // Insert request record
  await db
    .insertInto('request')
    .values({
      hostname: body.hostname,
      id: body.id,
      keywords: body.keywords,
      objective: body.objective,
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
