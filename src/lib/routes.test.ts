import { expect, test } from 'vitest'
import { knownRoutes } from '#lib/routes.ts'
import type { FileRoutesByTo } from '../routeTree.gen.ts'

type ExtractFirstSegment<path> = path extends `/${infer segment}`
  ? segment extends `~dash/${string}`
    ? never
    : segment extends `${infer head}/${string}`
      ? head
      : segment
  : never
type KnownRoute = ExtractFirstSegment<keyof FileRoutesByTo>

test('knownRoutes is exhaustive', () => {
  const expected = ['', 'auth', 'check', 'login', 'playground'] as const
  // Fails typecheck if a KnownRoute is missing from expected
  const _: Exclude<KnownRoute, (typeof expected)[number]> extends never
    ? true
    : Exclude<KnownRoute, (typeof expected)[number]> = true
  for (const route of expected) {
    expect(knownRoutes.has(route)).toBe(true)
  }
})
