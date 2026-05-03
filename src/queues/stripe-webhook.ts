import { env } from 'cloudflare:workers'
import type { Database } from '#db/client.ts'

export async function processStripeWebhookMessage(
  message: Message<processStripeWebhookMessage.Body>,
  db: Database,
) {
  const body = message.body
  switch (body.type) {
    case 'payment_intent.succeeded':
      return processPurchase(body.data, db)
    case 'charge.dispute.created':
      return processReversal(body.data, 'chargeback', db)
    case 'refund.created':
      return processReversal(body.data, 'refund', db)
  }
}

async function processPurchase(
  data: Extract<processStripeWebhookMessage.Body, { type: 'payment_intent.succeeded' }>['data'],
  db: Database,
) {
  const amountMills = data.amount_total * 10

  // Idempotency check
  const existing = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', data.id)
    .where('type', '=', 'purchase')
    .select('id')
    .executeTakeFirst()
  if (existing) return

  const entity = await findEntity(data.customer, db)
  if (!entity) return

  await db.transaction().execute(async (tx) => {
    const updated = await tx
      .updateTable(entity.table)
      .set((eb) => ({
        balance_mills: eb('balance_mills', '+', amountMills),
      }))
      .where('id', '=', entity.id)
      .returning('balance_mills')
      .executeTakeFirstOrThrow()

    await tx
      .insertInto('credit_transaction')
      .values({
        ...(entity.table === 'account'
          ? { account_id: entity.id }
          : { organization_id: entity.id }),
        amount_mills: amountMills,
        balance_after_mills: updated.balance_mills,
        reference_id: data.id,
        type: 'purchase',
      })
      .execute()
  })

  const newBalance = await db
    .selectFrom(entity.table)
    .where('id', '=', entity.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  await env.KV.put(`balance:${entity.id}`, String(newBalance.balance_mills))
}

async function processReversal(
  data: Extract<processStripeWebhookMessage.Body, { type: 'charge.dispute.created' }>['data'],
  type: 'chargeback' | 'refund',
  db: Database,
) {
  const amountMills = data.amount_total * 10

  // Idempotency check
  const existing = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', data.id)
    .where('type', '=', type)
    .select('id')
    .executeTakeFirst()
  if (existing) return

  const entity = await findEntity(data.customer, db)
  if (!entity) return

  await db.transaction().execute(async (tx) => {
    const current = await tx
      .selectFrom(entity.table)
      .where('id', '=', entity.id)
      .select('balance_mills')
      .forUpdate()
      .executeTakeFirstOrThrow()

    const deduction =
      type === 'refund' ? Math.min(amountMills, Math.max(0, current.balance_mills)) : amountMills

    const updated = await tx
      .updateTable(entity.table)
      .set((eb) => ({
        balance_mills: eb('balance_mills', '-', deduction),
      }))
      .where('id', '=', entity.id)
      .returning('balance_mills')
      .executeTakeFirstOrThrow()

    await tx
      .insertInto('credit_transaction')
      .values({
        ...(entity.table === 'account'
          ? { account_id: entity.id }
          : { organization_id: entity.id }),
        amount_mills: -deduction,
        balance_after_mills: updated.balance_mills,
        reference_id: data.id,
        type,
      })
      .execute()
  })

  const newBalance = await db
    .selectFrom(entity.table)
    .where('id', '=', entity.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  await env.KV.put(`balance:${entity.id}`, String(newBalance.balance_mills))
}

async function findEntity(stripeCustomerId: string, db: Database) {
  const entity = await db
    .selectFrom((eb) =>
      eb
        .selectFrom('account')
        .select(['id', 'balance_mills', eb.val('account').as('type')])
        .where('stripe_customer_id', '=', stripeCustomerId)
        .unionAll(
          eb
            .selectFrom('organization')
            .select(['id', 'balance_mills', eb.val('organization').as('type')])
            .where('stripe_customer_id', '=', stripeCustomerId),
        )
        .as('entity'),
    )
    .selectAll()
    .$narrowType<{ type: 'account' | 'organization' }>()
    .limit(1)
    .executeTakeFirst()
  if (!entity) return null
  return { table: entity.type, id: entity.id } as const
}

processStripeWebhookMessage.queueName = 'curl-stripe-webhook' as const

export namespace processStripeWebhookMessage {
  export type Body =
    | {
        type: 'payment_intent.succeeded'
        data: {
          amount_total: number
          customer: string
          id: string
        }
      }
    | {
        type: 'charge.dispute.created'
        data: {
          amount_total: number
          customer: string
          id: string
        }
      }
    | {
        type: 'refund.created'
        data: {
          amount_total: number
          customer: string
          id: string
        }
      }
}
