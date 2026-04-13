import { expect, test } from 'vitest'
import { create } from '../mod.ts'
import * as rules from '../rules.ts'

// Smoke tests that fetch live sources and verify extraction doesn't blow up.
// These do NOT assert exact content — only structural invariants.
// Run via: pnpm test --project md:smoke
//
// Check cases are defined on each rule via `defineRule({ checks: [...] })`.

for (const [name, rule] of Object.entries(rules)) {
  if (!('checks' in rule) || !rule.checks) {
    if (rule.key !== rules.curlMd.key) console.log(`Missing check for "${rule.key}"`)
    continue
  }
  for (const check of rule.checks) {
    const smokeTest = name === 'curlDocs' ? test.skip : test

    smokeTest(`${name}: ${check.url}`, async () => {
      const md = create({ rules: [rule()] })
      const result = await md.fetch(check.url)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      if (check.minLength) expect(result.content.length).toBeGreaterThan(check.minLength)
      if (check.title) expect(result.meta.title).toContain(check.title)
      for (const s of check.contains ?? []) expect(result.content).toContain(s)
      for (const s of check.notContains ?? []) expect(result.content).not.toContain(s)
    })
  }
}
