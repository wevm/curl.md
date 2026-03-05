import { customAlphabet } from 'nanoid'

export const prefix = 'curl_'

export function generate(): string {
  return `${prefix}${customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 32)()}`
}

export async function hash(token: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
