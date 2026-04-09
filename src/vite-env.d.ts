declare const __GIT_SHA__: string
declare const __HOST__: string
declare const __ORIGIN__: string
declare const __INITIAL_TOKENS_SAVED__: number
declare const __SENTRY_DSN__: string

declare module '*.woff2?arraybuffer' {
  const buffer: ArrayBuffer
  export default buffer
}

declare module '*.wasm?module' {
  const module: WebAssembly.Module
  export default module
}

declare module '*.mdx' {
  import type { ComponentType } from 'react'
  const Component: ComponentType<{ components?: Record<string, ComponentType> }>
  export default Component
  export const frontmatter: Record<string, unknown>
}
