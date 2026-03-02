import { expect, test } from 'vitest'
import * as ApiKey from '#lib/api-key.ts'

test('returns 64-char hex string', async () => {
  const result = await ApiKey.hash('curl_test123')
  expect(result).toMatch(/^[0-9a-f]{64}$/)
})

test('is deterministic', async () => {
  const a = await ApiKey.hash('curl_abc')
  const b = await ApiKey.hash('curl_abc')
  expect(a).toBe(b)
})

test('different tokens produce different hashes', async () => {
  const a = await ApiKey.hash('curl_one')
  const b = await ApiKey.hash('curl_two')
  expect(a).not.toBe(b)
})
