import { matchRule, type Rule, type Rules, toRuleList } from './defineRule.ts'
import type { Compute } from './types.ts'

export function resolve(
  url: string | URL,
  rules?: Rules,
): Compute<resolve.ReturnType> {
  const source = typeof url === 'string' ? new URL(url) : url
  const rule = matchRule(rules ? toRuleList(rules) : [], source)

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
  export type ReturnType = {
    headers: Record<string, string>
    rule: Rule | undefined
    source: URL
    url: URL
  }
}
