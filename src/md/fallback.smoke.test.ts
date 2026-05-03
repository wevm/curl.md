import { expect, test } from 'vitest'
import { create } from './mod.ts'
import * as profiles from './profiles.ts'
import * as rules from './rules.ts'

// Smoke tests that fetch live no-rule docs/reference pages and verify
// generic HTML extraction still returns non-empty markdown.
// Run via: pnpm test --project md:smoke

const checks = [
  {
    contains: ['Getting Started', 'Hello, world!'],
    minLength: 200,
    title: 'Getting Started',
    url: 'https://doc.rust-lang.org/book/ch01-00-getting-started.html',
  },
  {
    contains: ['Django at a glance'],
    minLength: 500,
    title: 'Django at a glance',
    url: 'https://docs.djangoproject.com/en/5.2/intro/overview/',
  },
  {
    contains: ['Crate serde'],
    minLength: 500,
    title: 'serde - Rust',
    url: 'https://docs.rs/serde/latest/serde/',
  },
  {
    contains: ['Tutorial - User Guide', 'FastAPI'],
    minLength: 1_000,
    title: 'Tutorial - User Guide - FastAPI',
    url: 'https://fastapi.tiangolo.com/tutorial/',
  },
  {
    contains: ['class String', 'arbitrary sequence of bytes'],
    minLength: 1_000,
    title: 'class String',
    url: 'https://docs.ruby-lang.org/en/master/String.html',
  },
  {
    contains: ['Tutorial: Get started with Go', 'brief introduction to Go programming'],
    minLength: 1_000,
    title: 'Tutorial: Get started with Go',
    url: 'https://go.dev/doc/tutorial/getting-started',
  },
] as const

const md = create({ profiles })

for (const check of checks) {
  test(`fallback: ${check.url}`, async () => {
    expect(hasRule(check.url)).toBe(false)

    const result = await md.fetch(check.url)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.content.trim().length).toBeGreaterThan(check.minLength)
    expect(result.meta.title).toContain(check.title)
    for (const s of check.contains) expect(result.content).toContain(s)
  })
}

function hasRule(url: string) {
  return Object.values(rules).some(
    (factory) =>
      typeof factory === 'function' && factory().patterns.some((pattern) => pattern.test(url)),
  )
}
