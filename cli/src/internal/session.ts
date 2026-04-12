import fs from 'node:fs'
import path from 'node:path'
import { defaultBaseUrl } from '../client.ts'
import { dataDir } from '../utils.ts'

export const Session = {
  path(baseUrl?: string) {
    const namespace = encodeURIComponent(normalizeBaseUrl(baseUrl))
    return path.join(dataDir(), 'sessions', `${namespace}.json`)
  },
  read(baseUrl?: string): Session.Data | null {
    const namespacedPath = Session.path(baseUrl)
    const session = readSessionFile(namespacedPath)
    if (session) return session

    const legacySession = readSessionFile(legacyPath())
    if (!legacySession || namespacedPath === legacyPath()) return null

    writeSessionFile(namespacedPath, legacySession)
    deleteFile(legacyPath())
    return legacySession
  },
  write(session: Partial<Session.Data>, baseUrl?: string) {
    const p = Session.path(baseUrl)
    const existing = Session.read(baseUrl)
    const merged = { ...existing, ...session }
    writeSessionFile(p, merged)
    if (p !== legacyPath()) deleteFile(legacyPath())
  },
  delete(baseUrl?: string) {
    deleteFile(Session.path(baseUrl))
    if (Session.path(baseUrl) !== legacyPath()) deleteFile(legacyPath())
  },
}

function readSessionFile(filePath: string): Session.Data | null {
  try {
    const session = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Session.Data
    if (!session.refresh_token) return null
    return session
  } catch {
    return null
  }
}

function writeSessionFile(filePath: string, session: Session.Data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(session), { mode: 0o600 })
}

function deleteFile(filePath: string) {
  try {
    fs.unlinkSync(filePath)
  } catch {}
}

function legacyPath() {
  return path.join(dataDir(), 'session.json')
}

function normalizeBaseUrl(baseUrl?: string) {
  const resolvedBaseUrl = baseUrl ?? process.env.CURLMD_BASE_URL ?? defaultBaseUrl

  try {
    return new URL(resolvedBaseUrl).origin
  } catch {
    return resolvedBaseUrl
  }
}

export declare namespace Session {
  export type Data = {
    organization_id?: string | undefined
    refresh_token?: string | undefined
    refresh_token_expires_at?: string | undefined
  }
}
