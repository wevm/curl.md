import { expect, test } from 'vitest'
import { isApiPath, knownRoutes } from '#lib/routes.ts'
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
  const expected = [
    '',
    'auth',
    'credits',
    'invite',
    'login',
    'playground',
  ] as const
  true satisfies Exclude<KnownRoute, (typeof expected)[number]> extends never
    ? true
    : Exclude<KnownRoute, (typeof expected)[number]>
  for (const route of expected) {
    expect(knownRoutes.has(route)).toBe(true)
  }
})

test('isApiPath matches domain paths', () => {
  expect(isApiPath('/example.com')).toBe(true)
  expect(isApiPath('/zod.dev/error-formatting')).toBe(true)
  expect(isApiPath('/docs.example.com/page')).toBe(true)
})

test('isApiPath matches protocol-prefixed paths', () => {
  expect(isApiPath('/https://zod.dev/error-formatting')).toBe(true)
  expect(isApiPath('/http://example.com')).toBe(true)
})

test('isApiPath rejects app routes', () => {
  expect(isApiPath('/')).toBe(false)
  expect(isApiPath('/login')).toBe(false)
  expect(isApiPath('/auth')).toBe(false)
  expect(isApiPath('/playground')).toBe(false)
})
