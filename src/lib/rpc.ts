import { hc } from 'hono/client'
import type { api } from '#api.ts'

export type AppType = typeof api

export const rpc = hc<AppType>(`https://${__HOST__}`)
