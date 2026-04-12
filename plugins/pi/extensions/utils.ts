import os from 'node:os'
import { Auth } from 'curl.md/internal'

export function createHeaders(auth: Auth.Headers | null) {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (auth?.authorization) headers.authorization = auth.authorization
  if (auth?.organization_id) headers['x-organization-id'] = auth.organization_id
  return headers
}

export function parseApiError(json: unknown) {
  if (typeof json !== 'object' || json === null) return undefined
  if (!('message' in json) || typeof json.message !== 'string') return undefined
  return {
    code:
      'code' in json && typeof json.code === 'string' ? json.code.toUpperCase() : 'REQUEST_FAILED',
    message: json.message,
  }
}

export function formatApiError(error: { code: string; message: string }) {
  return `(${error.code}) ${error.message}`
}

export function formatPathForDisplay(path: string) {
  const homeDir = os.homedir()
  if (path === homeDir) return '~'
  if (path.startsWith(`${homeDir}/`)) return `~${path.slice(homeDir.length)}`
  return path
}

export function parseNumberHeader(value: string | null) {
  if (!value) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}
