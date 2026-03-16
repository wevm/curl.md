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
    GH_CLIENT_SECRET: string
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

declare interface KV {
  get(key: string, type?: string): Promise<any>
  put(key: string, value: any, options?: any): Promise<void>
  delete(key: string): Promise<void>
  list(options?: any): Promise<any>
}

declare namespace KV {
  type Value<key extends string> = any
  type Key = string
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
