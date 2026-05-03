import { createMessageBatch } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { HttpResponse, http } from 'msw'
import { estimateTokenCount } from 'tokenx'
import { afterAll, expect, test } from 'vitest'
import { createClient } from '#db/client.ts'
import { processRequestEnrichmentMessage } from '#queues/request-enrichment.ts'
import { server } from '#test/workers.server.ts'

const db = createClient(env.DB.connectionString, { max: 1 })

afterAll(() => db.destroy())

test('upgrades estimated rows with html source tokens when fetch succeeds', async () => {
  const html = '<html><body><main><h1>Example</h1><p>Hello world</p></main></body></html>'
  server.use(
    http.get(
      'https://example.com/',
      () =>
        new HttpResponse(html, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
          status: 200,
        }),
    ),
  )

  await db
    .insertInto('request')
    .values({
      cached: false,
      hostname: 'example.com',
      id: 'req_enrich_1',
      markdown_tokens: 25,
      path: '/',
      source_tokens: 25,
      source_tokens_method: 'estimated',
      url: 'https://example.com',
    })
    .execute()

  const batch = createMessageBatch<processRequestEnrichmentMessage.Body>(
    processRequestEnrichmentMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          request_id: 'req_enrich_1',
          url: 'https://example.com',
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )

  await processRequestEnrichmentMessage(batch.messages[0]!, db)

  const row = await db
    .selectFrom('request')
    .where('id', '=', 'req_enrich_1')
    .select(['source_tokens', 'source_tokens_method'])
    .executeTakeFirstOrThrow()

  expect(row.source_tokens).toBe(estimateTokenCount(html))
  expect(row.source_tokens_method).toBe('html')
})

test('keeps estimated rows when html source tokens are smaller', async () => {
  const html = '<html><body><div id="app"></div></body></html>'
  server.use(
    http.get(
      'https://spa.example.com/',
      () =>
        new HttpResponse(html, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
          status: 200,
        }),
    ),
  )

  await db
    .insertInto('request')
    .values({
      cached: false,
      hostname: 'spa.example.com',
      id: 'req_fallback_1',
      markdown_tokens: 120,
      path: '/',
      source_tokens: 120,
      source_tokens_method: 'estimated',
      url: 'https://spa.example.com',
    })
    .execute()

  const batch = createMessageBatch<processRequestEnrichmentMessage.Body>(
    processRequestEnrichmentMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          request_id: 'req_fallback_1',
          url: 'https://spa.example.com',
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )

  await processRequestEnrichmentMessage(batch.messages[0]!, db)

  const row = await db
    .selectFrom('request')
    .where('id', '=', 'req_fallback_1')
    .select(['source_tokens', 'source_tokens_method'])
    .executeTakeFirstOrThrow()

  expect(estimateTokenCount(html)).toBeLessThan(120)
  expect(row.source_tokens).toBe(120)
  expect(row.source_tokens_method).toBe('estimated')
})

test('throws on transient enrichment fetch failures so the queue can retry', async () => {
  server.use(http.get('https://retry.example.com/', () => new HttpResponse(null, { status: 503 })))

  const batch = createMessageBatch<processRequestEnrichmentMessage.Body>(
    processRequestEnrichmentMessage.queueName,
    [
      {
        attempts: 1,
        body: {
          request_id: 'req_retry_1',
          url: 'https://retry.example.com',
        },
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ],
  )

  await expect(processRequestEnrichmentMessage(batch.messages[0]!, db)).rejects.toThrow(
    'Request enrichment fetch failed with 503',
  )
})
