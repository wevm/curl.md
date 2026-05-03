import { createMessageBatch } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterAll, expect, test } from 'vitest'
import { createClient } from '#db/client.ts'
import { processStripeWebhookMessage } from '#queues/stripe-webhook.ts'
import { createFactory } from '#test/factory.ts'

const db = createClient(env.DB.connectionString, { max: 1 })
const factory = createFactory(db)

afterAll(() => db.destroy())

test('processes payment_intent.succeeded for account', async () => {
  const customerId = `cus_${crypto.randomUUID()}`
  const sessionId = `pi_${crypto.randomUUID()}`
  const account = await factory.account.insert({})
  await db
    .updateTable('account')
    .set({ stripe_customer_id: customerId })
    .where('id', '=', account.id)
    .execute()

  const batch = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          type: 'payment_intent.succeeded',
          data: { customer: customerId, amount_total: 2000, id: sessionId },
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch.messages[0]!, db)

  const updated = await db
    .selectFrom('account')
    .where('id', '=', account.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(20000)

  const tx = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', sessionId)
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(tx.type).toBe('purchase')
  expect(tx.amount_mills).toBe(20000)
  expect(tx.balance_after_mills).toBe(20000)
  expect(tx.account_id).toBe(account.id)
})

test('processes payment_intent.succeeded for organization', async () => {
  const customerId = `cus_${crypto.randomUUID()}`
  const sessionId = `pi_${crypto.randomUUID()}`
  const account = await factory.account.insert({})
  const org = await factory.organization.insert({})
  await factory.organization_member.insert({
    account_id: account.id,
    organization_id: org.id,
    role: 'owner',
  })
  await db
    .updateTable('organization')
    .set({ stripe_customer_id: customerId })
    .where('id', '=', org.id)
    .execute()

  const batch = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          type: 'payment_intent.succeeded',
          data: { customer: customerId, amount_total: 5000, id: sessionId },
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch.messages[0]!, db)

  const updated = await db
    .selectFrom('organization')
    .where('id', '=', org.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(50000)

  const tx = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', sessionId)
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(tx.type).toBe('purchase')
  expect(tx.amount_mills).toBe(50000)
  expect(tx.balance_after_mills).toBe(50000)
  expect(tx.organization_id).toBe(org.id)
})

test('idempotency - same session processed twice', async () => {
  const customerId = `cus_${crypto.randomUUID()}`
  const sessionId = `pi_${crypto.randomUUID()}`
  const account = await factory.account.insert({})
  await db
    .updateTable('account')
    .set({ stripe_customer_id: customerId })
    .where('id', '=', account.id)
    .execute()

  const makeBody = () => ({
    type: 'payment_intent.succeeded' as const,
    data: { customer: customerId, amount_total: 3000, id: sessionId },
  })

  const batch1 = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: makeBody(),
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch1.messages[0]!, db)

  const batch2 = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: makeBody(),
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch2.messages[0]!, db)

  const updated = await db
    .selectFrom('account')
    .where('id', '=', account.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(30000)

  const txs = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', sessionId)
    .selectAll()
    .execute()
  expect(txs).toHaveLength(1)
})

test('processes charge.dispute.created for account', async () => {
  const customerId = `cus_${crypto.randomUUID()}`
  const chargeId = `ch_${crypto.randomUUID()}`
  const account = await factory.account.insert({})
  await db
    .updateTable('account')
    .set({ stripe_customer_id: customerId, balance_mills: 20000 })
    .where('id', '=', account.id)
    .execute()

  const batch = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          type: 'charge.dispute.created',
          data: { customer: customerId, amount_total: 2000, id: chargeId },
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch.messages[0]!, db)

  const updated = await db
    .selectFrom('account')
    .where('id', '=', account.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(0)

  const tx = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', chargeId)
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(tx.type).toBe('chargeback')
  expect(tx.amount_mills).toBe(-20000)
  expect(tx.balance_after_mills).toBe(0)
  expect(tx.account_id).toBe(account.id)
})

test('processes charge.dispute.created for organization', async () => {
  const customerId = `cus_${crypto.randomUUID()}`
  const chargeId = `ch_${crypto.randomUUID()}`
  const account = await factory.account.insert({})
  const org = await factory.organization.insert({})
  await factory.organization_member.insert({
    account_id: account.id,
    organization_id: org.id,
    role: 'owner',
  })
  await db
    .updateTable('organization')
    .set({ stripe_customer_id: customerId, balance_mills: 50000 })
    .where('id', '=', org.id)
    .execute()

  const batch = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          type: 'charge.dispute.created',
          data: { customer: customerId, amount_total: 5000, id: chargeId },
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch.messages[0]!, db)

  const updated = await db
    .selectFrom('organization')
    .where('id', '=', org.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(0)

  const tx = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', chargeId)
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(tx.type).toBe('chargeback')
  expect(tx.amount_mills).toBe(-50000)
  expect(tx.balance_after_mills).toBe(0)
  expect(tx.organization_id).toBe(org.id)
})

test('processes refund.created for account', async () => {
  const customerId = `cus_${crypto.randomUUID()}`
  const chargeId = `ch_${crypto.randomUUID()}`
  const account = await factory.account.insert({})
  await db
    .updateTable('account')
    .set({ stripe_customer_id: customerId, balance_mills: 30000 })
    .where('id', '=', account.id)
    .execute()

  const batch = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          type: 'refund.created',
          data: { customer: customerId, amount_total: 3000, id: chargeId },
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch.messages[0]!, db)

  const updated = await db
    .selectFrom('account')
    .where('id', '=', account.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(0)

  const tx = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', chargeId)
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(tx.type).toBe('refund')
  expect(tx.amount_mills).toBe(-30000)
  expect(tx.balance_after_mills).toBe(0)
  expect(tx.account_id).toBe(account.id)
})

test('idempotency - same chargeback processed twice', async () => {
  const customerId = `cus_${crypto.randomUUID()}`
  const chargeId = `ch_${crypto.randomUUID()}`
  const account = await factory.account.insert({})
  await db
    .updateTable('account')
    .set({ stripe_customer_id: customerId, balance_mills: 20000 })
    .where('id', '=', account.id)
    .execute()

  const makeBody = () => ({
    type: 'charge.dispute.created' as const,
    data: { customer: customerId, amount_total: 2000, id: chargeId },
  })

  const batch1 = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: makeBody(),
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch1.messages[0]!, db)

  const batch2 = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: makeBody(),
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch2.messages[0]!, db)

  const updated = await db
    .selectFrom('account')
    .where('id', '=', account.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(0)

  const txs = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', chargeId)
    .selectAll()
    .execute()
  expect(txs).toHaveLength(1)
})

test('refund clamps balance at zero', async () => {
  const customerId = `cus_${crypto.randomUUID()}`
  const refundId = `re_${crypto.randomUUID()}`
  const account = await factory.account.insert({})
  await db
    .updateTable('account')
    .set({ stripe_customer_id: customerId, balance_mills: 5000 })
    .where('id', '=', account.id)
    .execute()

  const batch = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          type: 'refund.created',
          data: { customer: customerId, amount_total: 2000, id: refundId },
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch.messages[0]!, db)

  const updated = await db
    .selectFrom('account')
    .where('id', '=', account.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(0)

  const tx = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', refundId)
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(tx.type).toBe('refund')
  expect(tx.amount_mills).toBe(-5000)
  expect(tx.balance_after_mills).toBe(0)
})

test('chargeback allows negative balance', async () => {
  const customerId = `cus_${crypto.randomUUID()}`
  const chargeId = `ch_${crypto.randomUUID()}`
  const account = await factory.account.insert({})
  await db
    .updateTable('account')
    .set({ stripe_customer_id: customerId, balance_mills: 5000 })
    .where('id', '=', account.id)
    .execute()

  const batch = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          type: 'charge.dispute.created',
          data: { customer: customerId, amount_total: 2000, id: chargeId },
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch.messages[0]!, db)

  const updated = await db
    .selectFrom('account')
    .where('id', '=', account.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(-15000)

  const tx = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', chargeId)
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(tx.type).toBe('chargeback')
  expect(tx.amount_mills).toBe(-20000)
  expect(tx.balance_after_mills).toBe(-15000)
})

test('refund with zero balance records zero deduction', async () => {
  const customerId = `cus_${crypto.randomUUID()}`
  const refundId = `re_${crypto.randomUUID()}`
  const account = await factory.account.insert({})
  await db
    .updateTable('account')
    .set({ stripe_customer_id: customerId })
    .where('id', '=', account.id)
    .execute()

  const batch = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          type: 'refund.created',
          data: { customer: customerId, amount_total: 1000, id: refundId },
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch.messages[0]!, db)

  const updated = await db
    .selectFrom('account')
    .where('id', '=', account.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(0)

  const tx = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', refundId)
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(tx.type).toBe('refund')
  expect(tx.amount_mills).toBe(0)
  expect(tx.balance_after_mills).toBe(0)
})

test('ignores missing customer', async () => {
  const sessionId = `pi_${crypto.randomUUID()}`
  const batch = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          type: 'payment_intent.succeeded',
          data: { customer: null, amount_total: 1000, id: sessionId },
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch.messages[0]!, db)

  const tx = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', sessionId)
    .selectAll()
    .executeTakeFirst()
  expect(tx).toBeUndefined()
})

test('ignores unknown customer', async () => {
  const sessionId = `pi_${crypto.randomUUID()}`
  const batch = createMessageBatch<processStripeWebhookMessage.Body>(
    processStripeWebhookMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          type: 'payment_intent.succeeded',
          data: {
            customer: `cus_unknown_${crypto.randomUUID()}`,
            amount_total: 1000,
            id: sessionId,
          },
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processStripeWebhookMessage(batch.messages[0]!, db)

  const tx = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', sessionId)
    .selectAll()
    .executeTakeFirst()
  expect(tx).toBeUndefined()
})
