import { Hono } from 'hono'
import { expect, test } from 'vitest'
import { z } from 'zod'
import { validator } from '#lib/hono.ts'

test('returns validation_error with issues for invalid input', async () => {
  const app = new Hono().post(
    '/test',
    validator('json', z.object({ name: z.string().min(2) })),
    (c) => c.json({ ok: true }, 200),
  )

  const res = await app.request('/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '' }),
  })
  expect(res.status).toBe(400)
  await expect(res.json()).resolves.toEqual({
    code: 'validation_error',
    message: expect.any(String),
    issues: [{ path: 'name', message: expect.any(String) }],
  })
})

test('returns multiple issues for multiple failures', async () => {
  const app = new Hono().post(
    '/test',
    validator('json', z.object({ name: z.string().min(2), age: z.number().min(0) })),
    (c) => c.json({ ok: true }, 200),
  )

  const res = await app.request('/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '', age: -1 }),
  })
  expect(res.status).toBe(400)
  await expect(res.json()).resolves.toEqual({
    code: 'validation_error',
    message: expect.any(String),
    issues: expect.arrayContaining([
      { path: 'name', message: expect.any(String) },
      { path: 'age', message: expect.any(String) },
    ]),
  })
})

test('passes through on valid input', async () => {
  const app = new Hono().post(
    '/test',
    validator('json', z.object({ name: z.string().min(2) })),
    (c) => c.json({ ok: true }, 200),
  )

  const res = await app.request('/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'hello' }),
  })
  expect(res.status).toBe(200)
  await expect(res.json()).resolves.toEqual({ ok: true })
})
