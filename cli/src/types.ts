import { hc } from 'hono/client'
import type { api } from '../../src/api.ts'

export type Client = ReturnType<typeof hc<typeof api>>

export type Command = { command: string; description?: string }
