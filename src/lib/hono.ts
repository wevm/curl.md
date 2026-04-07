import { zValidator } from '@hono/zod-validator'
import type { Context, TypedResponse, ValidationTargets } from 'hono'
import type { z } from 'zod'

export async function rateLimit(
  kv: KV,
  ctx: { waitUntil: (p: Promise<unknown>) => void },
  config: { ip: string; key: string; max: number; window: number },
) {
  const key = `ratelimit:${config.key}:${config.ip}` as const
  const now = Math.floor(Date.now() / 1000)
  const record = await kv.get(key, 'json')

  const reset = record && record.reset > now ? record.reset : now + config.window
  const count = record && record.reset > now ? record.count + 1 : 1
  if (count > config.max) return { error: true, reset } as const

  ctx.waitUntil(
    kv.put(key, JSON.stringify({ count, reset }), {
      expirationTtl: config.window,
    }),
  )

  return { error: false } as const
}

/** Typed invalid API key response for RPC. Never reached at runtime (auth middleware handles it). */
export function invalidApiKey(
  c: Context,
): TypedResponse<{ code: 'invalid_api_key'; message: string }, 401, 'json'> {
  return c.json({ code: 'invalid_api_key' as const, message: 'Invalid API key' }, 401)
}

/** Always false at runtime; typed as `boolean` so TypeScript keeps the branch and widens the handler return type to include the 400 validation error response for RPC. */
export const narrowValidation = false as boolean

/** Typed validation error response for RPC. Never reached at runtime (validator middleware handles it). */
export function validationError(
  c: Context,
): TypedResponse<
  { code: 'validation_error'; message: string; issues: { message: string; path: string }[] },
  400,
  'json'
> {
  return c.json(
    {
      code: 'validation_error' as const,
      message: 'Validation failed',
      issues: [] as { message: string; path: string }[],
    },
    400,
  )
}

function validationHook(
  result: {
    success: boolean
    error?: { issues: { message: string; path: PropertyKey[] }[] }
  },
  c: Context,
) {
  if (!result.success)
    return c.json(
      {
        code: 'validation_error',
        message: 'Validation failed',
        issues: result.error?.issues.map((i) => ({
          message: i.message,
          path: i.path.join('.'),
        })),
      },
      400,
    )
}

export const validator = ((target: keyof ValidationTargets, schema: z.ZodType) =>
  zValidator(target, schema, validationHook)) as typeof zValidator
