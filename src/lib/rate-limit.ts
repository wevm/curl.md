import type { TypedKV } from '#lib/kv.ts'

export async function rateLimit(
  kv: TypedKV,
  ctx: { waitUntil: (p: Promise<unknown>) => void },
  config: { ip: string; key: string; max: number; window: number },
): Promise<{ error: true; reset: number } | { error: false }> {
  const kvKey = `ratelimit:${config.key}:${config.ip}` as const
  const now = Math.floor(Date.now() / 1000)
  const record = await kv.get(kvKey, 'json')

  const reset = record && record.reset > now ? record.reset : now + config.window
  const count = record && record.reset > now ? record.count + 1 : 1

  if (count > config.max) return { error: true, reset }

  ctx.waitUntil(
    kv.put(kvKey, JSON.stringify({ count, reset }), {
      expirationTtl: config.window,
    }),
  )
  return { error: false }
}
