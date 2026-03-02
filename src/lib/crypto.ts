const ALGORITHM = 'AES-GCM'
const IV_LENGTH = 12

export async function encrypt(plaintext: string, key: string): Promise<string> {
  const cryptoKey = await importKey(key)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    cryptoKey,
    new TextEncoder().encode(plaintext),
  )
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), IV_LENGTH)
  return bufferToBase64(combined)
}

export async function decrypt(encoded: string, key: string): Promise<string> {
  const cryptoKey = await importKey(key)
  const combined = base64ToBuffer(encoded)
  const iv = combined.slice(0, IV_LENGTH)
  const ciphertext = combined.slice(IV_LENGTH)
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    cryptoKey,
    ciphertext,
  )
  return new TextDecoder().decode(plaintext)
}

function importKey(base64Key: string) {
  return crypto.subtle.importKey(
    'raw',
    base64ToBuffer(base64Key).buffer as ArrayBuffer,
    ALGORITHM,
    false,
    ['encrypt', 'decrypt'],
  )
}

function bufferToBase64(buffer: Uint8Array): string {
  let binary = ''
  for (const byte of buffer) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
