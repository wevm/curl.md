import { afterEach, beforeAll, vi } from 'vitest'
import { server } from './server.ts'

vi.mock('../package.json', () => ({ default: { version: 'x.y.z' } }))

// Suppress CLI spinner/console output from cluttering test output
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' })
  return () => server.close()
})

afterEach(() => server.resetHandlers())
