import { expectTypeOf, test } from 'vitest'
import { createClient, type Client } from './client.ts'

test('fetch types', () => {
  const client = createClient()

  client.fetch('example.com', {
    // @ts-expect-error
    o: 'foo bar baz',
  })

  client.fetch('example.com', {
    objective: 'foo bar baz',
    options: {
      init: {
        signal: new AbortController().signal,
      },
    },
  })

  type RouteFetch = ReturnType<typeof createClient>['api'][':url{.+}']['$get']
  type RouteFetchQuery = NonNullable<NonNullable<Parameters<RouteFetch>[0]>['query']>
  type WrapperFetch = Client['fetch']
  type WrapperFetchOptions = NonNullable<Parameters<WrapperFetch>[1]>
  type RouteFetchRequestOptions = NonNullable<Parameters<RouteFetch>[1]>

  expectTypeOf(client.fetch).parameters.toEqualTypeOf<
    [url: string, options?: WrapperFetchOptions]
  >()
  expectTypeOf(client.fetch).returns.toEqualTypeOf<ReturnType<RouteFetch>>()

  expectTypeOf<WrapperFetchOptions['options']>().toEqualTypeOf<
    RouteFetchRequestOptions | undefined
  >()
  expectTypeOf<WrapperFetchOptions['fresh']>().toEqualTypeOf<boolean | undefined>()
  expectTypeOf<WrapperFetchOptions['keywords']>().toEqualTypeOf<string[] | undefined>()
  expectTypeOf<WrapperFetchOptions['mode']>().toEqualTypeOf<RouteFetchQuery['mode'] | undefined>()
  expectTypeOf<WrapperFetchOptions['objective']>().toEqualTypeOf<
    RouteFetchQuery['objective'] | undefined
  >()

  // @ts-expect-error request options must be nested under options
  const invalidHeaders: WrapperFetchOptions = { headers: { authorization: 'Bearer token' } }

  // @ts-expect-error single-letter query aliases are not part of the public API
  const invalidAlias: WrapperFetchOptions = { k: ['foo'] }

  // @ts-expect-error old Hono-style request shape is not part of the public API
  const invalidOptions: WrapperFetchOptions = { param: { url: 'https://example.com' } }
  expectTypeOf(invalidHeaders).toEqualTypeOf<WrapperFetchOptions>()
  expectTypeOf(invalidAlias).toEqualTypeOf<WrapperFetchOptions>()
  expectTypeOf(invalidOptions).toEqualTypeOf<WrapperFetchOptions>()
})
