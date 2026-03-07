import { builtinRules, type Rule } from './rules.ts'
import type { Compute } from './types.ts'

export function resolve(
  url: string | URL,
  options?: resolve.Options,
): Compute<resolve.ReturnType> {
  const source = typeof url === 'string' ? new URL(url) : url

  const rule = (() => {
    const hostname = source.hostname
    const userRule = options?.rules?.[hostname]
    if (userRule) {
      if (typeof userRule === 'function') return { resolve: userRule }
      return userRule
    }
    return builtinRules.get(hostname)
  })()

  const resolved = (() => {
    if (!rule?.resolve) return { url: source, headers: {} }
    const result = rule.resolve(source)
    if (!result) return { url: source, headers: {} }
    if (result instanceof URL) return { url: result, headers: {} }
    return result
  })()

  return {
    headers: resolved.headers ?? {},
    rule,
    source: source,
    url: resolved.url,
  }
}

export namespace resolve {
  export type Options = {
    rules?: Record<string, Rule | ((url: URL) => URL | undefined)>
  }

  export type ReturnType = {
    headers: Record<string, string>
    rule: Rule | undefined
    source: URL
    url: URL
  }
}
