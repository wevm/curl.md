import { HttpResponse, http } from 'msw'
import { afterEach, expect, test, vi } from 'vitest'
import { server } from '../test/server.ts'
import { createClient, defaultBaseUrl } from './client.ts'

afterEach(() => {
  vi.unstubAllEnvs()
})

test('createClient.fetch moves target fragment into anchor query', async () => {
  let requestUrl: URL | undefined
  server.use(
    http.get('*', ({ request }) => {
      requestUrl = new URL(request.url)
      return HttpResponse.json({ content: '# Example' })
    }),
  )

  const client = createClient(defaultBaseUrl)
  const res = await client.fetch('example.com/foo#bar')

  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ content: '# Example' })
  expect(requestUrl?.pathname).toBe('/api/example.com/foo')
  expect(requestUrl?.searchParams.get('anchor')).toBe('bar')
})

test('createClient.fetch preserves target query string when stripping fragment', async () => {
  let requestUrl: URL | undefined
  server.use(
    http.get('*', ({ request }) => {
      requestUrl = new URL(request.url)
      return HttpResponse.json({ content: '# Example' })
    }),
  )

  const client = createClient(defaultBaseUrl)
  const res = await client.fetch('example.com/foo?tab=api#install')

  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ content: '# Example' })
  expect(requestUrl?.pathname).toBe('/api/example.com/foo%3Ftab%3Dapi')
  expect(requestUrl?.searchParams.get('anchor')).toBe('install')
})

test('createClient.fetch leaves hash-free target urls unchanged', async () => {
  let requestUrl: URL | undefined
  server.use(
    http.get('*', ({ request }) => {
      requestUrl = new URL(request.url)
      return HttpResponse.json({ content: '# Example' })
    }),
  )

  const client = createClient(defaultBaseUrl)
  const res = await client.fetch('example.com/foo?tab=api')

  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ content: '# Example' })
  expect(requestUrl?.pathname).toBe('/api/example.com/foo%3Ftab%3Dapi')
  expect(requestUrl?.searchParams.has('anchor')).toBe(false)
})

test('createClient adds explicit ai agent header', async () => {
  let aiAgent: string | null | undefined
  server.use(
    http.get('*', ({ request }) => {
      aiAgent = request.headers.get('x-ai-agent')
      return HttpResponse.json({ version: 'x.y.z', published_at: null })
    }),
  )

  const client = createClient(defaultBaseUrl, { aiAgent: 'gemini' })
  const res = await client.api.cli.latest.$get({ query: {} })

  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ published_at: null, version: 'x.y.z' })
  expect(aiAgent).toBe('gemini')
})

test('createClient aiAgent overrides std-env fallback detection', async () => {
  let aiAgent: string | null | undefined
  vi.stubEnv('AI_AGENT', 'codex')
  server.use(
    http.get('*', ({ request }) => {
      aiAgent = request.headers.get('x-ai-agent')
      return HttpResponse.json({ version: 'x.y.z', published_at: null })
    }),
  )

  const client = createClient(defaultBaseUrl, { aiAgent: 'gemini' })
  const res = await client.api.cli.latest.$get({ query: {} })

  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ published_at: null, version: 'x.y.z' })
  expect(aiAgent).toBe('gemini')
})

test('createClient omits unsupported explicit aiAgent values without std-env fallback', async () => {
  const aiAgents: Array<string | null> = []
  vi.stubEnv('AI_AGENT', 'codex')
  server.use(
    http.get('*', ({ request }) => {
      aiAgents.push(request.headers.get('x-ai-agent'))
      return HttpResponse.json({ version: 'x.y.z', published_at: null })
    }),
  )

  for (const aiAgent of ['', 'invalid']) {
    const client = createClient(defaultBaseUrl, { aiAgent: aiAgent as never })
    const res = await client.api.cli.latest.$get({ query: {} })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ published_at: null, version: 'x.y.z' })
  }

  expect(aiAgents).toEqual([null, null])
})

test('createClient falls back to std-env ai agent detection', async () => {
  let aiAgent: string | null | undefined
  vi.stubEnv('AI_AGENT', 'codex')
  server.use(
    http.get('*', ({ request }) => {
      aiAgent = request.headers.get('x-ai-agent')
      return HttpResponse.json({ version: 'x.y.z', published_at: null })
    }),
  )

  const client = createClient(defaultBaseUrl)
  const res = await client.api.cli.latest.$get({ query: {} })

  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ published_at: null, version: 'x.y.z' })
  expect(aiAgent).toBe('codex')
})

test('createClient omits ai agent header when std-env detects an unsupported agent', async () => {
  let aiAgent: string | null | undefined
  vi.stubEnv('AI_AGENT', 'devin')
  server.use(
    http.get('*', ({ request }) => {
      aiAgent = request.headers.get('x-ai-agent')
      return HttpResponse.json({ version: 'x.y.z', published_at: null })
    }),
  )

  const client = createClient(defaultBaseUrl)
  const res = await client.api.cli.latest.$get({ query: {} })

  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ published_at: null, version: 'x.y.z' })
  expect(aiAgent).toBeNull()
})

test('createClient.fetch keeps ai agent header when adding authorization', async () => {
  let aiAgent: string | null | undefined
  let authorization: string | null | undefined
  server.use(
    http.get('*', ({ request }) => {
      aiAgent = request.headers.get('x-ai-agent')
      authorization = request.headers.get('authorization')
      return HttpResponse.json({ content: '# Example' })
    }),
  )

  const client = createClient(defaultBaseUrl, { aiAgent: 'gemini' })
  const res = await client.fetch('example.com', { token: 'curlmd_test' })

  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ content: '# Example' })
  expect(aiAgent).toBe('gemini')
  expect(authorization).toBe('Bearer curlmd_test')
})

test('createClient omits ai agent header in browser-like environment without process', async () => {
  let aiAgent: string | null | undefined
  const originalProcess = globalThis.process
  // @ts-expect-error -- simulate browser environment
  globalThis.process = undefined
  server.use(
    http.get('*', ({ request }) => {
      aiAgent = request.headers.get('x-ai-agent')
      return HttpResponse.json({ version: 'x.y.z', published_at: null })
    }),
  )

  try {
    const client = createClient(defaultBaseUrl)
    const res = await client.api.cli.latest.$get({ query: {} })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ published_at: null, version: 'x.y.z' })
    expect(aiAgent).toBeNull()
  } finally {
    globalThis.process = originalProcess
  }
})

test('createClient keeps ai agent header when route requests add headers', async () => {
  let aiAgent: string | null | undefined
  let organizationId: string | null | undefined
  server.use(
    http.get('*', ({ request }) => {
      aiAgent = request.headers.get('x-ai-agent')
      organizationId = request.headers.get('x-organization-id')
      return HttpResponse.json({ version: 'x.y.z', published_at: null })
    }),
  )

  const client = createClient(defaultBaseUrl, { aiAgent: 'gemini' })
  const res = await client.api.cli.latest.$get(
    { query: {} },
    { headers: { 'x-organization-id': 'org_123' } },
  )

  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ published_at: null, version: 'x.y.z' })
  expect(aiAgent).toBe('gemini')
  expect(organizationId).toBe('org_123')
})
