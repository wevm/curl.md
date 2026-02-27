import { env, waitUntil } from 'cloudflare:workers'

const dailyLimit = 1_000

export async function rateLimit(request: Request): Promise<{
  limited: boolean
  remaining: number
}> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const date = new Date().toISOString().slice(0, 10)
  const key = `ratelimit:${ip}:${date}` as const

  const count = Number((await env.KV.get(key)) ?? 0)
  if (count >= dailyLimit) return { limited: true, remaining: 0 }

  // Expire at end of day (max 24h TTL)
  waitUntil(env.KV.put(key, String(count + 1), { expirationTtl: 86_400 }))
  return { limited: false, remaining: dailyLimit - count - 1 }
}
