import { expect, test } from 'vitest'
import { detectPageProfile } from './mod.ts'
import * as profiles from './profiles.ts'

// Smoke tests that fetch live profile targets and verify detection still matches.
// These do NOT assert exact extracted content — only structural invariants.
// Run via: pnpm test --project md:smoke

for (const check of [
  { key: 'mintlify', url: 'https://mintlify.com/docs' },
  { key: 'vitepress', url: 'https://vitepress.dev/guide/what-is-vitepress' },
]) {
  test(`${check.key}: ${check.url}`, async () => {
    const response = await fetch(check.url)
    expect(response.ok).toBe(true)
    if (!response.ok) return

    const url = new URL(response.url)
    const profile = detectPageProfile(await response.text(), url, profiles)

    expect(profile?.key).toBe(check.key)
    expect(profile?.contentRootSelectors.length).toBeGreaterThan(0)
    expect(profile?.markers.length).toBeGreaterThan(0)

    if (check.key === 'mintlify') {
      expect(profile?.markdownRequest).toEqual({
        headers: { Accept: 'text/markdown' },
        url: url.href,
      })
      expect(profile?.normalize).toEqual(expect.any(Function))
      return
    }

    const markdownUrl = new URL(url.href)
    markdownUrl.pathname = `${markdownUrl.pathname.replace(/\.html$/, '')}.md`
    markdownUrl.search = ''
    expect(profile?.markdownUrl).toBe(markdownUrl.href)
  })
}
