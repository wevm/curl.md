import { env } from 'cloudflare:workers'
import { estimateTokenCount } from 'tokenx'
import type { Database } from '#db/client.ts'
import type { DB } from '#db/types.gen.ts'

export async function processRequestMessage(
  message: Message<processRequestMessage.Body>,
  db: Database,
) {
  const body = message.body

  // Insert request record (idempotent for retries)
  await db
    .insertInto('request')
    .values({
      account_id: body.account_id,
      api_key_id: body.api_key_id,
      cached: body.cached,
      extracted_tokens: body.extracted_tokens,
      filtered_tokens: body.filtered_tokens,
      hostname: body.hostname,
      id: body.id,
      keywords: body.keywords,
      markdown_tokens: body.markdown_tokens,
      mode: body.mode,
      objective: body.objective,
      organization_id: body.organization_id,
      path: body.path,
      source_tokens: body.source_tokens,
      source_tokens_method: body.source_tokens_method,
      url: body.url,
      user_agent: body.user_agent,
    })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute()

  await invalidateTokensSavedCache(body.hostname)

  // Deduct credits if billable
  const billingEntity = body.organization_id ?? body.account_id
  if (body.billable && body.cost_mills > 0 && billingEntity) {
    // Idempotency — unique partial index on (reference_id, type) prevents duplicates
    const existing = await db
      .selectFrom('credit_transaction')
      .where('reference_id', '=', body.id)
      .where('type', '=', 'request')
      .select('id')
      .executeTakeFirst()
    if (existing) return

    const table = body.organization_id ? ('organization' as const) : ('account' as const)
    await db.transaction().execute(async (tx) => {
      const updated = await tx
        .updateTable(table)
        .set((eb) => ({
          balance_mills: eb('balance_mills', '-', body.cost_mills),
        }))
        .where('id', '=', billingEntity)
        .where('balance_mills', '>=', body.cost_mills)
        .returning('balance_mills')
        .executeTakeFirst()
      if (!updated) return

      await tx
        .insertInto('credit_transaction')
        .values({
          ...(body.organization_id
            ? { organization_id: body.organization_id }
            : { account_id: billingEntity }),
          amount_mills: -body.cost_mills,
          balance_after_mills: updated.balance_mills,
          reference_id: body.id,
          type: 'request',
        })
        .execute()
    })

    // Update KV balance cache
    const newBalance = await db
      .selectFrom(table)
      .where('id', '=', billingEntity)
      .select('balance_mills')
      .executeTakeFirstOrThrow()
    await env.KV.put(`balance:${billingEntity}`, String(newBalance.balance_mills))
  }

  if (body.source_tokens_method === 'estimated') await enrichSourceTokensFromHtml(body, db)
}

processRequestMessage.queueName = 'curl-request' as const

export namespace processRequestMessage {
  export type Body = {
    account_id: string | null
    api_key_id: string | null
    billable: boolean
    cached: boolean
    cost_mills: number
    hostname: string
    id: string
    keywords: string | null
    extracted_tokens: number | null
    filtered_tokens: number | null
    markdown_tokens: number
    mode: 'rush' | 'smart' | null
    objective: string | null
    organization_id: string | null
    path: string
    source_tokens: number
    source_tokens_method: DB.request['source_tokens_method']
    url: string
    user_agent: string | undefined
  }
}

async function enrichSourceTokensFromHtml(body: processRequestMessage.Body, db: Database) {
  try {
    const response = await fetch(body.url, {
      headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${env.HOST}/1.0; +https://${env.HOST})` },
      redirect: 'follow',
    })
    if (!response.ok) return

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return

    const sourceTokens = estimateTokenCount(await response.text())
    const updated = await db
      .updateTable('request')
      .set({ source_tokens: sourceTokens, source_tokens_method: 'html' })
      .where('id', '=', body.id)
      .where('source_tokens', '<', sourceTokens)
      .where('source_tokens_method', '=', 'estimated')
      .executeTakeFirst()

    if (Number(updated.numUpdatedRows ?? 0) > 0) await invalidateTokensSavedCache(body.hostname)
  } catch {
    // Best-effort enrichment only; keep the markdown fallback when HTML fetch fails.
  }
}

async function invalidateTokensSavedCache(hostname: string) {
  await Promise.all([
    env.KV.delete('stats:tokens_saved'),
    env.KV.delete(`stats:tokens_saved:${hostname}`),
  ])
}
