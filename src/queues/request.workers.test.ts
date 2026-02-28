import { createMessageBatch, env, fetchMock } from 'cloudflare:test'
import { afterEach, beforeAll, expect, test } from 'vitest'
import { getDb } from '#lib/db.ts'
import { processRequestMessage } from '#queues/request.ts'

const db = getDb(env.DB.connectionString)

beforeAll(() => {
  fetchMock.activate()
  fetchMock.disableNetConnect()
  return () => fetchMock.deactivate()
})

afterEach(() => {
  fetchMock.assertNoPendingInterceptors()
})

test('inserts request record', async () => {
  const batch = createMessageBatch<processRequestMessage.Body>(
    processRequestMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          estimated: false,
          hostname: 'example.com',
          id: 'req_1',
          keywords: null,
          markdownLength: 100,
          objective: null,
          path: '/',
          tokens_saved: null,
          url: 'https://example.com',
          user_agent: 'test-agent',
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processRequestMessage(batch.messages[0]!, db)

  const row = await db
    .selectFrom('request')
    .where('id', '=', 'req_1')
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(row.hostname).toBe('example.com')
  expect(row.url).toBe('https://example.com')
  expect(row.path).toBe('/')
  expect(row.user_agent).toBe('test-agent')
})

test('updates tokens_saved when estimated', async () => {
  const html = `<html><body>${'x'.repeat(1000)}</body></html>`
  fetchMock
    .get('https://example.com')
    .intercept({ path: '/page' })
    .reply(200, html, { headers: { 'content-type': 'text/html' } })

  const batch = createMessageBatch<processRequestMessage.Body>(
    processRequestMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          estimated: true,
          hostname: 'example.com',
          id: 'req_2',
          keywords: null,
          markdownLength: 100,
          objective: null,
          path: '/page',
          tokens_saved: 500,
          url: 'https://example.com/page',
          user_agent: 'test-agent',
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processRequestMessage(batch.messages[0]!, db)

  const row = await db
    .selectFrom('request')
    .where('id', '=', 'req_2')
    .selectAll()
    .executeTakeFirstOrThrow()
  const expectedTokensSaved = Math.round((html.length - 100) / 4)
  expect(row.tokens_saved).toBe(expectedTokensSaved)
})

test('clears KV cache when tokens_saved is set', async () => {
  await env.KV.put('stats:tokens_saved', '1000')

  const batch = createMessageBatch<processRequestMessage.Body>(
    processRequestMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          estimated: false,
          hostname: 'example.com',
          id: 'req_3',
          keywords: null,
          markdownLength: 100,
          objective: null,
          path: '/',
          tokens_saved: 500,
          url: 'https://example.com',
          user_agent: 'test-agent',
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processRequestMessage(batch.messages[0]!, db)

  const cached = await env.KV.get('stats:tokens_saved')
  expect(cached).toBeNull()
})

test('skips tokens_saved update when fetch fails', async () => {
  fetchMock
    .get('https://example.com')
    .intercept({ path: '/fail' })
    .reply(500, 'error')

  const batch = createMessageBatch<processRequestMessage.Body>(
    processRequestMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          estimated: true,
          hostname: 'example.com',
          id: 'req_4',
          keywords: null,
          markdownLength: 100,
          objective: null,
          path: '/fail',
          tokens_saved: 42,
          url: 'https://example.com/fail',
          user_agent: 'test-agent',
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )
  await processRequestMessage(batch.messages[0]!, db)

  const row = await db
    .selectFrom('request')
    .where('id', '=', 'req_4')
    .selectAll()
    .executeTakeFirstOrThrow()
  expect(row.tokens_saved).toBe(42)
})
