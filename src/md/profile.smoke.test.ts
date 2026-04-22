import { expect, test } from 'vitest'
import { detectPageProfile } from './mod.ts'
import * as profiles from './profiles.ts'

// Smoke tests that fetch live profile targets and verify detection still matches.
// These do NOT assert exact extracted content — only structural invariants.
// Run via: pnpm test --project md:smoke

for (const [name, profileDetector] of Object.entries(profiles)) {
  if (!profileDetector.checks) continue

  for (const check of profileDetector.checks) {
    test(`${name}: ${check.url}`, async () => {
      const response = await fetch(check.url)
      expect(response.ok).toBe(true)
      if (!response.ok) return

      const url = new URL(response.url)
      const profile = detectPageProfile(await response.text(), url, profiles)

      expect(profile?.key).toBe(profileDetector.key)
      expect(profile?.contentRootSelectors.length).toBeGreaterThan(0)
      expect(profile?.markers.length).toBeGreaterThan(0)

      if (profile?.markdownRequest) {
        expect(profile?.markdownRequest).toEqual({
          headers: { Accept: 'text/markdown' },
          url: url.href,
        })
        if (profile.normalize) expect(profile.normalize).toEqual(expect.any(Function))
        return
      }

      if (!profile?.markdownUrl) {
        expect(profile?.normalize).toBeUndefined()
        return
      }

      const markdownUrl = new URL(url.href)
      markdownUrl.pathname = `${markdownUrl.pathname.replace(/\.html$/, '')}.md`
      markdownUrl.search = ''
      expect(profile?.markdownUrl).toBe(markdownUrl.href)
    })
  }
}
