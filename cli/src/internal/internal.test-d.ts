import { expectTypeOf, test } from 'vitest'
import { Auth, Session } from '../exports/internal.ts'

test('internal subpath types', () => {
  const resolveAuthHeaders = Auth.createResolver('https://curl.md')

  expectTypeOf(Session.path).parameters.toEqualTypeOf<[baseUrl?: string | undefined]>()
  expectTypeOf(Session.path).returns.toEqualTypeOf<string>()
  expectTypeOf(Session.read).parameters.toEqualTypeOf<[baseUrl?: string | undefined]>()
  expectTypeOf(Session.read).returns.toEqualTypeOf<Session.Data | null>()
  expectTypeOf(Session.write).parameters.toEqualTypeOf<
    [session: Partial<Session.Data>, baseUrl?: string | undefined]
  >()
  expectTypeOf(Session.delete).parameters.toEqualTypeOf<[baseUrl?: string | undefined]>()
  expectTypeOf(resolveAuthHeaders).returns.toEqualTypeOf<Promise<Auth.Headers | null>>()
})
