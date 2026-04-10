import { customAlphabet } from 'nanoid'
import * as Nanoid from '#lib/nanoid.ts'

export const prefix = 'curlmd_'
const tokenPattern = new RegExp(`^${prefix}[${Nanoid.alphabet}]{32}$`)

export function generate(): string {
  return `${prefix}${customAlphabet(Nanoid.alphabet, 32)()}`
}

export function isApiKey(value: string): boolean {
  return tokenPattern.test(value)
}

export async function hash(token: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
