import { expect, test } from 'vitest'
import * as Crypto from '#lib/crypto.ts'

const testKey = 'dGVzdC1lbmNyeXB0aW9uLWtleXRlc3QtZW5jcnlwdGk='

test('encrypt then decrypt returns original plaintext', async () => {
  const plaintext = 'ghu_abc123_secret_token'
  const encrypted = await Crypto.encrypt(plaintext, testKey)
  expect(encrypted).not.toBe(plaintext)
  const decrypted = await Crypto.decrypt(encrypted, testKey)
  expect(decrypted).toBe(plaintext)
})

test('encrypt produces different ciphertext each time', async () => {
  const plaintext = 'same-input'
  const a = await Crypto.encrypt(plaintext, testKey)
  const b = await Crypto.encrypt(plaintext, testKey)
  expect(a).not.toBe(b)
})

test('decrypt with wrong key throws', async () => {
  const encrypted = await Crypto.encrypt('secret', testKey)
  const wrongKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
  await expect(Crypto.decrypt(encrypted, wrongKey)).rejects.toThrow()
})
