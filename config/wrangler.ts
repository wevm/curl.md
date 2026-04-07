import * as fs from 'node:fs'
import JSONC from 'tiny-jsonc'
import type { Plugin } from 'vite'
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

export function cloudflareDevWorkarounds(): Plugin {
  return {
    name: 'cloudflare-dev-workarounds',
    enforce: 'pre',
    configureServer(server) {
      // Rewrite Host/Origin headers to localhost for /cdn-cgi/explorer requests
      // so they pass Miniflare's origin validation when accessed via a custom domain.
      server.middlewares.use((req, _res, next) => {
        const url = req.originalUrl ?? ''
        if (url.startsWith('/cdn-cgi/explorer')) {
          const raw = req.rawHeaders
          for (let i = 0; i < raw.length; i += 2) {
            if (raw[i]?.toLowerCase() === 'host') raw[i + 1] = 'localhost'
            if (raw[i]?.toLowerCase() === 'origin') raw[i + 1] = 'http://localhost'
          }
        }
        next()
      })

      // Vite/Miniflare can throw uncaught socket errors during SSR fetches when a
      // client disconnects mid-request or Miniflare restarts a worker during HMR.
      // https://github.com/cloudflare/workers-sdk/issues/12047
      const socketErrors = new Set(['ERR_STREAM_WRITE_AFTER_END', 'EPIPE', 'ECONNRESET'])
      process.on('uncaughtException', (err) => {
        if ('code' in err && socketErrors.has(err.code as string)) return
        if (err.message?.includes('Workers runtime canceled this request')) return
        throw err
      })
    },
  }
}
