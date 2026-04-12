import { expectTypeOf, test } from 'vitest'
import { createClient, type Client } from './client.ts'

test('fetch types', () => {
  const client = createClient()

  // @ts-expect-error internal-only endpoint is omitted from the public client
  void client.api['og.png']
  // @ts-expect-error internal-only endpoint is omitted from the public client
  void client.api.sentry
  // @ts-expect-error internal-only endpoint is omitted from the public client
  void client.api.stripe

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
    token: 'curlmd_test',
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
  expectTypeOf<WrapperFetchOptions['token']>().toEqualTypeOf<string | undefined>()

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

test('error types', async () => {
  const client = createClient()

  {
    const res = await client.fetch('example.com')
    switch (res.status) {
      case 400: {
        const json = await res.json()
        expectTypeOf(json.code).toEqualTypeOf<'validation_error'>()
        void json
        return
      }
      case 502: {
        const json = await res.json()
        expectTypeOf(json.code).toEqualTypeOf<'fetch_failed' | 'ai_failed'>()
        void json
        return
      }
    }
  }
  {
    const res = await client.api[':url{.+}'].$get({ param: { url: 'example.com' }, query: {} })
    switch (res.status) {
      case 400: {
        const json = await res.json()
        expectTypeOf(json.code).toEqualTypeOf<'validation_error'>()
        void json
        return
      }
      case 502: {
        const json = await res.json()
        expectTypeOf(json.code).toEqualTypeOf<'fetch_failed' | 'ai_failed'>()
        void json
        return
      }
    }
  }
  {
    const res = await client.api.cli.latest.$get({ query: {} })
    switch (res.status) {
      case 200: {
        const json = await res.json()
        expectTypeOf(json).toEqualTypeOf<{
          readonly published_at: string | null
          readonly version: string
        }>()
        void json
        return
      }
      case 502: {
        const json = await res.json()
        expectTypeOf(json.code).toEqualTypeOf<'upstream_error' | 'version_not_found'>()
        void json
        return
      }
    }
  }
})
