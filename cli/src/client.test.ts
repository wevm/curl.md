import { HttpResponse, http } from 'msw'
import { expect, test } from 'vitest'
import { server } from '../test/server.ts'
import { createClient, defaultBaseUrl } from './client.ts'

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
