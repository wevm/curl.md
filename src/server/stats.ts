import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { createClient } from '#db/client.ts'
import { requestTokensSavedSumSql } from '#db/utils.ts'

export const getTokensSaved = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const request = getRequest()
    const origin = request.headers.get('origin')
    if (origin && origin !== `https://${env.HOST}`) throw new Error('Forbidden')

    const cached = await env.KV.get('stats:tokens_saved')
    if (cached !== null) return { tokens_saved: Number(cached) }

    const db = createClient(env.DB.connectionString)
    const result = await db
      .selectFrom('request')
      .select(requestTokensSavedSumSql().as('total'))
      .executeTakeFirstOrThrow()
    return { tokens_saved: Number(result.total ?? 0) }
  } catch {
    return { tokens_saved: __INITIAL_TOKENS_SAVED__ }
  }
})
