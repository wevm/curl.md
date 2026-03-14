import * as fs from 'node:fs'
import JSONC from 'tiny-jsonc'
import { z } from 'zod/v4/mini'

export function getWranglerVar(name: keyof z.infer<typeof wranglerVars>) {
  const json = z.parse(wranglerJsoncCodec, fs.readFileSync('wrangler.jsonc', 'utf-8'))
  const env = z.parse(z.optional(cloudflareEnv), process.env.CLOUDFLARE_ENV)
  const vars = env ? json.env?.[env]?.vars : json.vars
  const value = vars?.[name]
  if (value === undefined) throw new Error(`"${name}" not found in wrangler.jsonc "vars"`)
  return value
}

const cloudflareEnv = z.enum(['production', 'preview'])

const wranglerVars = z.object({
  HOST: z.string(),
})

const wranglerJsoncCodec = z.codec(
  z.string(),
  z.object({
    vars: z.optional(wranglerVars),
    env: z.optional(z.record(cloudflareEnv, z.object({ vars: z.optional(wranglerVars) }))),
  }),
  {
    decode: (raw) => JSONC.parse(raw),
    encode: (value) => JSON.stringify(value),
  },
)
