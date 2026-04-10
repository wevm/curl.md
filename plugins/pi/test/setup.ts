import { afterEach, beforeAll } from 'vitest'
import { server } from './server.ts'

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
  return () => server.close()
})

afterEach(() => server.resetHandlers())
