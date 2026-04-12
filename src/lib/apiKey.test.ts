import { expect, test } from 'vitest'
import * as ApiKey from '#lib/apiKey.ts'

test('generate matches api key shape and excludes cli access tokens', () => {
  const token = ApiKey.generate()

  expect(ApiKey.isApiKey(token)).toBe(true)
  expect(ApiKey.isApiKey('curlmd_at_abcdefghijklmnopqrstuvwxyz0123456789abcd')).toBe(false)
})

test('returns 64-char hex string', async () => {
  const result = await ApiKey.hash('curlmd_test123')
  expect(result).toMatch(/^[0-9a-f]{64}$/)
})

test('is deterministic', async () => {
  const a = await ApiKey.hash('curlmd_abc')
  const b = await ApiKey.hash('curlmd_abc')
  expect(a).toBe(b)
})

test('different tokens produce different hashes', async () => {
  const a = await ApiKey.hash('curlmd_one')
  const b = await ApiKey.hash('curlmd_two')
  expect(a).not.toBe(b)
})
