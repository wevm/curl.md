import { env } from 'cloudflare:workers'
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
      ai_agent: body.ai_agent ?? null,
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

  if (body.source_tokens_method !== 'estimated') return

  // Best-effort analytics only; billing/logging should not retry just because enrichment handoff fails.
  try {
    await env.REQUEST_ENRICH_QUEUE.send({ request_id: body.id, url: body.url })
  } catch (error) {
    console.error(`Request enrichment enqueue failed for ${body.id}:`, error)
  }
}

processRequestMessage.queueName = 'curl-request' as const

export namespace processRequestMessage {
  export type Body = {
    account_id: string | null
    ai_agent?: DB.request['ai_agent']
    api_key_id: string | null
    billable: boolean
    cached: boolean
    cost_mills: number
    extracted_tokens: number | null
    filtered_tokens: number | null
    hostname: string
    id: string
    keywords: string | null
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
