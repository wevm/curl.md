import { expect, test } from 'vitest'
import { knownRoutes } from '#lib/routes.ts'
import type { FileRoutesByTo } from '../routeTree.gen.ts'

type FirstSegment<path> = path extends `/${infer segment}`
  ? segment extends `~dash/${string}`
    ? never
    : segment extends `${infer head}/${string}`
      ? head
      : segment
  : never
type KnownRoute = FirstSegment<keyof FileRoutesByTo>

test('knownRoutes is exhaustive', () => {
  const expected = ['', 'auth', 'check', 'login', 'playground'] as const
  true satisfies Exclude<KnownRoute, (typeof expected)[number]> extends never
    ? true
    : Exclude<KnownRoute, (typeof expected)[number]>
  for (const route of expected) {
    expect(knownRoutes.has(route)).toBe(true)
  }
})
