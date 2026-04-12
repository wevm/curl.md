// Stub type declarations for Cloudflare Workers APIs used by shared code (e.g. `#lib/*`).
//
// The CLI package imports modules from the main app that reference Cloudflare-specific
// globals (`Env`, `D1Database`, `cloudflare:workers`, etc.). Since the CLI doesn't
// install `@cloudflare/workers-types`, TypeScript would fail to resolve these types.
// This file provides minimal ambient declarations so the CLI can type-check without
// pulling in the full Workers type package.
//
// oxlint-disable @typescript-eslint/no-explicit-any -- intentionally loose stubs
declare namespace Cloudflare {
  interface Env {
    ASSETS: { fetch(input: any): Promise<Response> }
    GH_CLIENT_ID: string
    KV: KV
    GH_CLIENT_SECRET: string
    GH_URL: string
    TOKEN_ENCRYPTION_KEY: string
    [key: string]: any
  }
}

declare module 'cloudflare:workers' {
  export function waitUntil(promise: Promise<any>): void
  export const env: Cloudflare.Env
}

declare interface D1Database {
  prepare(query: string): any
}

declare interface D1DatabaseSession {
  prepare(query: string): any
}

declare namespace KV {
  type Value<key extends string> = key extends 'cli:latest'
    ? { published_at: string | null; version: string }
    : any

  type Key = string
}

declare interface KV {
  get<key extends KV.Key>(key: key, type: 'json'): Promise<KV.Value<key> | null>
  get(key: KV.Key): Promise<string | null>
  get(key: KV.Key, type: 'text'): Promise<string | null>
  get(key: KV.Key, type: 'arrayBuffer'): Promise<ArrayBuffer | null>
  get(key: KV.Key, type: 'stream'): Promise<ReadableStream | null>

  put<key extends KV.Key>(
    key: key,
    value: KV.Value<key> | string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      expiration?: number
      expirationTtl?: number
      metadata?: unknown
    },
  ): Promise<void>
  put(key: string, value: any, options?: any): Promise<void>
  delete(key: string): Promise<void>
  list<metadata = unknown>(options?: {
    prefix?: string
    limit?: number
    cursor?: string
  }): Promise<{
    keys: { name: KV.Key; expiration?: number; metadata?: metadata }[]
    list_complete: boolean
    cursor?: string
    cacheStatus: string | null
  }>
}

declare interface Message<T = unknown> {
  readonly body: T
  readonly id: string
  readonly timestamp: Date
  ack(): void
  retry(options?: { delaySeconds?: number }): void
}

declare interface Env extends Cloudflare.Env {}

interface ImportMetaEnv {
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
