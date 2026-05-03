import { createMessageBatch } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterAll, expect, test, vi } from 'vitest'
import { createClient } from '#db/client.ts'
import * as Nanoid from '#lib/nanoid.ts'
import { processRequestMessage } from '#queues/request.ts'
import { createFactory } from '#test/factory.ts'

const db = createClient(env.DB.connectionString, { max: 1 })
const factory = createFactory(db)
const queueSendResponse = {
  metadata: {
    metrics: {
      backlogBytes: 0,
      backlogCount: 0,
    },
  },
}

afterAll(() => db.destroy())

test('inserts request record', async () => {
  const batch = createMessageBatch<processRequestMessage.Body>(processRequestMessage.queueName, [
    {
      attempts: 1,
      body: {
        account_id: null,
        ai_agent: 'amp',
        api_key_id: null,
        billable: false,
        cached: false,
        cost_mills: 0,

        hostname: 'example.com',
        id: 'req_1',
        keywords: null,
        extracted_tokens: 15,
        filtered_tokens: 20,
        markdown_tokens: 25,
        objective: 'Summarize the page',
        organization_id: null,
        path: '/',
        source_tokens: 40,
        source_tokens_method: 'html',
        url: 'https://example.com',
        user_agent: 'test-agent',
      },
      id: crypto.randomUUID(),
      timestamp: new Date(),
    },
  ])
  await processRequestMessage(batch.messages[0]!, db)

  const row = await db
    .selectFrom('request')
    .where('id', '=', 'req_1')
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(row.ai_agent).toBe('amp')
  expect(row.extracted_tokens).toBe(15)
  expect(row.filtered_tokens).toBe(20)
  expect(row.hostname).toBe('example.com')
  expect(row.markdown_tokens).toBe(25)
  expect(row.url).toBe('https://example.com')
  expect(row.path).toBe('/')
  expect(row.source_tokens).toBe(40)
  expect(row.source_tokens_method).toBe('html')
  expect(row.user_agent).toBe('test-agent')
})

test('leaves KV stats cache untouched when a request is recorded', async () => {
  await env.KV.put('stats:tokens_saved', '1000')
  await env.KV.put('stats:tokens_saved:example.com', '500')

  const batch = createMessageBatch<processRequestMessage.Body>(processRequestMessage.queueName, [
    {
      attempts: 1,
      body: {
        account_id: null,
        api_key_id: null,
        billable: false,
        cached: false,
        cost_mills: 0,

        hostname: 'example.com',
        id: 'req_3',
        keywords: null,
        extracted_tokens: null,
        filtered_tokens: null,
        markdown_tokens: 25,
        mode: null,
        objective: null,
        organization_id: null,
        path: '/',
        source_tokens: 25,
        source_tokens_method: 'estimated',
        url: 'https://example.com',
        user_agent: 'test-agent',
      },
      id: crypto.randomUUID(),
      timestamp: new Date(),
    },
  ])
  await processRequestMessage(batch.messages[0]!, db)

  const cached = await env.KV.get('stats:tokens_saved')
  const hostCached = await env.KV.get('stats:tokens_saved:example.com')
  expect(cached).toBe('1000')
  expect(hostCached).toBe('500')
})

test('does not fail when enrichment queue send fails', async () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const sendSpy = vi
    .spyOn(env.REQUEST_ENRICH_QUEUE, 'send')
    .mockRejectedValue(new Error('queue send failed'))

  try {
    const batch = createMessageBatch<processRequestMessage.Body>(processRequestMessage.queueName, [
      {
        attempts: 1,
        body: {
          account_id: null,
          api_key_id: null,
          billable: false,
          cached: false,
          cost_mills: 0,
          hostname: 'ratelimit.example.com',
          id: 'req_no_kv_delete',
          keywords: null,
          extracted_tokens: null,
          filtered_tokens: null,
          markdown_tokens: 25,
          mode: null,
          objective: null,
          organization_id: null,
          path: '/',
          source_tokens: 60,
          source_tokens_method: 'estimated',
          url: 'https://ratelimit.example.com',
          user_agent: 'test-agent',
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ])

    await expect(processRequestMessage(batch.messages[0]!, db)).resolves.toBeUndefined()
    expect(sendSpy).toHaveBeenCalledWith({
      request_id: 'req_no_kv_delete',
      url: 'https://ratelimit.example.com',
    })

    const row = await db
      .selectFrom('request')
      .where('id', '=', 'req_no_kv_delete')
      .select(['id', 'source_tokens_method'])
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ id: 'req_no_kv_delete', source_tokens_method: 'estimated' })
  } finally {
    consoleErrorSpy.mockRestore()
    sendSpy.mockRestore()
  }
})

test('stores total savings when stage counts are present', async () => {
  const batch = createMessageBatch<processRequestMessage.Body>(processRequestMessage.queueName, [
    {
      attempts: 1,
      body: {
        account_id: null,
        api_key_id: null,
        billable: false,
        cached: false,
        cost_mills: 0,

        hostname: 'example.com',
        id: 'req_4',
        keywords: 'docs,guide',
        extracted_tokens: null,
        filtered_tokens: 18,
        markdown_tokens: 25,
        objective: null,
        organization_id: null,
        path: '/fail',
        source_tokens: 60,
        source_tokens_method: 'markdown',
        url: 'https://example.com/fail',
        user_agent: 'test-agent',
      },
      id: crypto.randomUUID(),
      timestamp: new Date(),
    },
  ])
  await processRequestMessage(batch.messages[0]!, db)

  const row = await db
    .selectFrom('request')
    .where('id', '=', 'req_4')
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(row.extracted_tokens).toBeNull()
  expect(row.filtered_tokens).toBe(18)
  expect(row.source_tokens).toBe(60)
  expect(row.source_tokens_method).toBe('markdown')
})

test('enqueues html enrichment for estimated rows', async () => {
  const sendSpy = vi.spyOn(env.REQUEST_ENRICH_QUEUE, 'send').mockResolvedValue(queueSendResponse)

  try {
    const batch = createMessageBatch<processRequestMessage.Body>(processRequestMessage.queueName, [
      {
        attempts: 1,
        body: {
          account_id: null,
          api_key_id: null,
          billable: false,
          cached: false,
          cost_mills: 0,
          extracted_tokens: null,
          filtered_tokens: null,
          hostname: 'example.com',
          id: 'req_enrich_html',
          keywords: null,
          markdown_tokens: 25,
          mode: null,
          objective: null,
          organization_id: null,
          path: '/',
          source_tokens: 25,
          source_tokens_method: 'estimated',
          url: 'https://example.com',
          user_agent: 'test-agent',
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ])

    await processRequestMessage(batch.messages[0]!, db)

    expect(sendSpy).toHaveBeenCalledWith({
      request_id: 'req_enrich_html',
      url: 'https://example.com',
    })

    const row = await db
      .selectFrom('request')
      .where('id', '=', 'req_enrich_html')
      .select(['source_tokens', 'source_tokens_method'])
      .executeTakeFirstOrThrow()

    expect(row.source_tokens).toBe(25)
    expect(row.source_tokens_method).toBe('estimated')
  } finally {
    sendSpy.mockRestore()
  }
})

test('does not enqueue html enrichment for non-estimated rows', async () => {
  const sendSpy = vi.spyOn(env.REQUEST_ENRICH_QUEUE, 'send').mockResolvedValue(queueSendResponse)

  try {
    const batch = createMessageBatch<processRequestMessage.Body>(processRequestMessage.queueName, [
      {
        attempts: 1,
        body: {
          account_id: null,
          api_key_id: null,
          billable: false,
          cached: false,
          cost_mills: 0,
          extracted_tokens: null,
          filtered_tokens: null,
          hostname: 'example.com',
          id: 'req_keep_fallback',
          keywords: null,
          markdown_tokens: 120,
          mode: null,
          objective: null,
          organization_id: null,
          path: '/',
          source_tokens: 120,
          source_tokens_method: 'markdown',
          url: 'https://example.com',
          user_agent: 'test-agent',
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ])

    await processRequestMessage(batch.messages[0]!, db)

    expect(sendSpy).not.toHaveBeenCalled()
  } finally {
    sendSpy.mockRestore()
  }
})

test('enqueues html enrichment for cached estimated rows', async () => {
  const sendSpy = vi.spyOn(env.REQUEST_ENRICH_QUEUE, 'send').mockResolvedValue(queueSendResponse)

  try {
    const batch = createMessageBatch<processRequestMessage.Body>(processRequestMessage.queueName, [
      {
        attempts: 1,
        body: {
          account_id: null,
          api_key_id: null,
          billable: false,
          cached: true,
          cost_mills: 0,
          extracted_tokens: null,
          filtered_tokens: null,
          hostname: 'example.com',
          id: 'req_cached_est',
          keywords: null,
          markdown_tokens: 120,
          mode: null,
          objective: null,
          organization_id: null,
          path: '/',
          source_tokens: 120,
          source_tokens_method: 'estimated',
          url: 'https://example.com',
          user_agent: 'test-agent',
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ])

    await processRequestMessage(batch.messages[0]!, db)

    expect(sendSpy).toHaveBeenCalledWith({
      request_id: 'req_cached_est',
      url: 'https://example.com',
    })
  } finally {
    sendSpy.mockRestore()
  }
})

test('deducts credits when billable', async () => {
  const account = await factory.account.insert({})
  await db
    .updateTable('account')
    .set({ balance_mills: 10000 })
    .where('id', '=', account.id)
    .execute()

  const requestId = Nanoid.generate()
  const batch = createMessageBatch<processRequestMessage.Body>(processRequestMessage.queueName, [
    {
      attempts: 1,
      body: {
        account_id: account.id,
        api_key_id: null,
        billable: true,
        cached: false,
        cost_mills: 10,

        hostname: 'example.com',
        id: requestId,
        keywords: null,
        extracted_tokens: null,
        filtered_tokens: null,
        markdown_tokens: 25,
        objective: null,
        organization_id: null,
        path: '/',
        source_tokens: 25,
        source_tokens_method: 'markdown',
        url: 'https://example.com',
        user_agent: 'test-agent',
      },
      id: crypto.randomUUID(),
      timestamp: new Date(),
    },
  ])
  await processRequestMessage(batch.messages[0]!, db)

  const updated = await db
    .selectFrom('account')
    .where('id', '=', account.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(9990)

  const tx = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', requestId)
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(tx.type).toBe('request')
  expect(tx.amount_mills).toBe(-10)
  expect(tx.balance_after_mills).toBe(9990)
})

test('deducts credits for organization', async () => {
  const org = await factory.organization.insert({})
  await db
    .updateTable('organization')
    .set({ balance_mills: 5000 })
    .where('id', '=', org.id)
    .execute()

  const requestId = Nanoid.generate()
  const batch = createMessageBatch<processRequestMessage.Body>(processRequestMessage.queueName, [
    {
      attempts: 1,
      body: {
        account_id: null,
        api_key_id: null,
        billable: true,
        cached: false,
        cost_mills: 30,

        hostname: 'example.com',
        id: requestId,
        keywords: null,
        extracted_tokens: null,
        filtered_tokens: null,
        markdown_tokens: 25,
        objective: null,
        organization_id: org.id,
        path: '/',
        source_tokens: 25,
        source_tokens_method: 'markdown',
        url: 'https://example.com',
        user_agent: 'test-agent',
      },
      id: crypto.randomUUID(),
      timestamp: new Date(),
    },
  ])
  await processRequestMessage(batch.messages[0]!, db)

  const updated = await db
    .selectFrom('organization')
    .where('id', '=', org.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(4970)
})

test('does not create negative balance', async () => {
  const account = await factory.account.insert({})
  await db.updateTable('account').set({ balance_mills: 10 }).where('id', '=', account.id).execute()

  const requestId = Nanoid.generate()
  const batch = createMessageBatch<processRequestMessage.Body>(processRequestMessage.queueName, [
    {
      attempts: 1,
      body: {
        account_id: account.id,
        api_key_id: null,
        billable: true,
        cached: false,
        cost_mills: 30,

        hostname: 'example.com',
        id: requestId,
        keywords: null,
        extracted_tokens: null,
        filtered_tokens: null,
        markdown_tokens: 25,
        objective: null,
        organization_id: null,
        path: '/',
        source_tokens: 25,
        source_tokens_method: 'markdown',
        url: 'https://example.com',
        user_agent: 'test-agent',
      },
      id: crypto.randomUUID(),
      timestamp: new Date(),
    },
  ])
  await processRequestMessage(batch.messages[0]!, db)

  const updated = await db
    .selectFrom('account')
    .where('id', '=', account.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(10)

  const tx = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', requestId)
    .selectAll()
    .executeTakeFirst()
  expect(tx).toBeUndefined()
})

test('skips deduction when not billable', async () => {
  const account = await factory.account.insert({})
  await db
    .updateTable('account')
    .set({ balance_mills: 10000 })
    .where('id', '=', account.id)
    .execute()

  const requestId = Nanoid.generate()
  const batch = createMessageBatch<processRequestMessage.Body>(processRequestMessage.queueName, [
    {
      attempts: 1,
      body: {
        account_id: account.id,
        api_key_id: null,
        billable: false,
        cached: false,
        cost_mills: 1,

        hostname: 'example.com',
        id: requestId,
        keywords: null,
        extracted_tokens: null,
        filtered_tokens: null,
        markdown_tokens: 25,
        objective: null,
        organization_id: null,
        path: '/',
        source_tokens: 25,
        source_tokens_method: 'markdown',
        url: 'https://example.com',
        user_agent: 'test-agent',
      },
      id: crypto.randomUUID(),
      timestamp: new Date(),
    },
  ])
  await processRequestMessage(batch.messages[0]!, db)

  const updated = await db
    .selectFrom('account')
    .where('id', '=', account.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(10000)
})

test('deducts credits only once for same request', async () => {
  const account = await factory.account.insert({})
  await db
    .updateTable('account')
    .set({ balance_mills: 10000 })
    .where('id', '=', account.id)
    .execute()

  const requestId = Nanoid.generate()
  const makeMessage = () =>
    createMessageBatch<processRequestMessage.Body>(processRequestMessage.queueName, [
      {
        attempts: 1,
        body: {
          account_id: account.id,
          api_key_id: null,
          billable: true,
          cached: false,
          cost_mills: 30,

          hostname: 'example.com',
          id: requestId,
          keywords: null,
          extracted_tokens: null,
          filtered_tokens: null,
          markdown_tokens: 25,
          objective: null,
          organization_id: null,
          path: '/',
          source_tokens: 25,
          source_tokens_method: 'markdown',
          url: 'https://example.com',
          user_agent: 'test-agent',
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ])

  // Process first time
  await processRequestMessage(makeMessage().messages[0]!, db)

  // Process second time — idempotent insert is skipped via onConflict
  await processRequestMessage(makeMessage().messages[0]!, db)

  const updated = await db
    .selectFrom('account')
    .where('id', '=', account.id)
    .select('balance_mills')
    .executeTakeFirstOrThrow()
  expect(updated.balance_mills).toBe(9970)

  const txns = await db
    .selectFrom('credit_transaction')
    .where('reference_id', '=', requestId)
    .where('type', '=', 'request')
    .selectAll()
    .execute()
  expect(txns).toHaveLength(1)
  expect(txns[0]!.amount_mills).toBe(-30)
})
