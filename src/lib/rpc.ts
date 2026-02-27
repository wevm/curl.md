import { hc } from 'hono/client'
import type { api } from '#api.ts'

export const rpc = hc<typeof api>('/')
