import { vi } from 'vitest'

vi.mock('../package.json', () => ({ default: { version: 'x.y.z' } }))
