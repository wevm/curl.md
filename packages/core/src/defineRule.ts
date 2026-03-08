/**
 * Define a rule for resolving URLs to their raw markdown sources.
 *
 * The function shorthand creates a catch-all rule (no `patterns`) that matches
 * any URL. Use the object form with `patterns` to restrict matching to specific
 * hostnames or URL patterns.
 */
export function defineRule<T extends Rule>(rule: T): T
export function defineRule(rule: (url: URL) => URL | undefined): Rule
export function defineRule(rule: Rule | ((url: URL) => URL | undefined)): Rule {
  if (typeof rule === 'function') return { resolve: rule }
  return rule
}

export type FetchContext = {
  tokens?: { github?: string }
  userAgent: string
}

export type Rule = {
  patterns?: (string | RegExp)[]
  resolve?: (
    url: URL,
  ) => URL | { url: URL; headers?: Record<string, string> } | undefined
  fetch?: (
    url: URL,
    resolved: { url: URL; headers: Record<string, string> },
    context: FetchContext,
  ) => Promise<Response>
  parse?: (
    response: Response,
  ) => Promise<
    { content: string; meta?: Record<string, string> } | null | undefined
  >
}

export type Rules = Rule[] | Record<string, Rule>

export function toRuleList(rules: Rules): Rule[] {
  return Array.isArray(rules) ? rules : Object.values(rules)
}

export function matchRule(rules: Rule[], url: URL): Rule | undefined {
  let catchAll: Rule | undefined
  for (const rule of rules) {
    if (!rule.patterns) {
      catchAll ??= rule
      continue
    }
    for (const pattern of rule.patterns) {
      if (typeof pattern === 'string') {
        if (pattern === url.hostname) return rule
      } else if (pattern.test(url.href)) return rule
    }
  }
  return catchAll
}
