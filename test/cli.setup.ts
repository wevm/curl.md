import { vi } from 'vitest'

vi.mock('../cli/package.json', () => ({ default: { version: 'x.y.z' } }))
