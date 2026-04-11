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

export function parseMdFetchArgs(input: string) {
  const tokens = tokenizeArgs(input.trim())
  if (tokens.length === 0) return { url: '' }

  let fresh = false
  const keywords: string[] = []
  let mode: 'rush' | 'smart' | undefined
  let objective: string | undefined
  let url: string | undefined

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!

    if (token === '--fresh') {
      fresh = true
      continue
    }

    if (token === '--objective' || token === '-o') {
      const value = readFlagValue(tokens, i + 1, token, { allowMultipleTokens: true })
      objective = value.value
      i = value.nextIndex
      continue
    }

    if (token === '--keyword' || token === '--keywords' || token === '-k') {
      const value = readFlagValue(tokens, i + 1, token, { allowMultipleTokens: true })
      keywords.push(...value.value.split(',').map((keyword) => keyword.trim()))
      i = value.nextIndex
      continue
    }

    if (token === '--mode' || token === '-m') {
      const value = readFlagValue(tokens, i + 1, token)
      if (value.value !== 'rush' && value.value !== 'smart')
        throw new Error('Invalid value for --mode. Use rush or smart.')
      mode = value.value
      i = value.nextIndex
      continue
    }

    if (token.startsWith('-')) throw new Error(`Unknown flag ${token}`)
    if (url) throw new Error(`Unexpected argument ${token}`)
    url = token
  }

  return {
    fresh: fresh ? true : undefined,
    keywords: keywords.filter(Boolean).length > 0 ? keywords.filter(Boolean) : undefined,
    mode,
    objective,
    url: url ?? '',
  }
}

export function parseNumberHeader(value: string | null) {
  if (!value) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function readFlagValue(
  tokens: string[],
  index: number,
  flag: string,
  options?: { allowMultipleTokens?: boolean },
) {
  const value = tokens[index]
  if (!value || value.startsWith('-')) throw new Error(`Missing value for ${flag}`)

  let nextIndex = index
  if (options?.allowMultipleTokens) {
    while (tokens[nextIndex + 1] && !tokens[nextIndex + 1]!.startsWith('-')) nextIndex++
  }

  return {
    nextIndex,
    value: tokens.slice(index, nextIndex + 1).join(' '),
  }
}

function tokenizeArgs(input: string) {
  if (!input) return []

  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!

    if (char === '\\') {
      const next = input[i + 1]
      if (next) {
        current += next
        i++
      }
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (quote) throw new Error('Unterminated quote in command arguments.')
  if (current) tokens.push(current)
  return tokens
}
