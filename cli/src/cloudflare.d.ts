// biome-ignore-all lint/suspicious/noExplicitAny: stub types for CLI typechecking without @cloudflare/workers-types
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
