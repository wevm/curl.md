// Stub type declarations for Cloudflare Workers APIs used by shared code (e.g. `#lib/*`).
//
// The CLI package imports modules from the main app that reference Cloudflare-specific
// globals (`Env`, `D1Database`, `cloudflare:workers`, etc.). Since the CLI doesn't
// install `@cloudflare/workers-types`, TypeScript would fail to resolve these types.
// This file provides minimal ambient declarations so the CLI can type-check without
// pulling in the full Workers type package.
//
// biome-ignore-all lint/suspicious/noExplicitAny: intentionally loose stubs
declare namespace Cloudflare {
  interface Env {
    ASSETS: { fetch(input: any): Promise<Response> }
    KV: {
      get<T = string>(key: string, options?: any): Promise<T | null>
      put(key: string, value: string, options?: any): Promise<void>
      delete(key: string): Promise<void>
    }
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

declare interface Env extends Cloudflare.Env {}
