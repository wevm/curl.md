import { expect, test } from 'vitest'
import * as ApiKey from '#lib/apiKey.ts'

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
