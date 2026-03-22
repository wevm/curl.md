import * as child from 'node:child_process'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import autoImport from 'unplugin-auto-import/vite'
import iconsResolver from 'unplugin-icons/resolver'
import icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'
import { getWranglerVar } from './config/wrangler.ts'
import { createClient } from './db/client.ts'
import { Env } from './test/env.ts'

export default defineConfig(async () => ({
  server: {
    allowedHosts: ['curl.local'],
  },
  plugins: [
    // Vite/Miniflare can throw uncaught socket errors (ECONNRESET, EPIPE) during
    // SSR fetches when a client disconnects mid-request.
    {
      name: 'swallow-socket-errors',
      configureServer() {
        const socketErrors = new Set(['ERR_STREAM_WRITE_AFTER_END', 'EPIPE', 'ECONNRESET'])
        process.on('uncaughtException', (err) => {
          if ('code' in err && socketErrors.has(err.code as string)) return
          throw err
        })
      },
    },
    tailwindcss(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      // Override bindings for tests (testcontainers DB, emulate GitHub)
      ...(process.env.VITEST || process.env.TEST
        ? {
            remoteBindings: false,
            config(config) {
              const parsed = Env.parse(process.env)
              const DB_URL = parsed.DB_URL
              config.hyperdrive = config.hyperdrive?.map((h) => ({
                ...h,
                localConnectionString: DB_URL,
              }))
              config.vars = { ...config.vars, ...parsed }
            },
          }
        : {}),
    }),
    tanstackStart(),
    icons({ compiler: 'jsx', jsx: 'react' }),
    autoImport({
      dts: 'src/auto-imports.d.ts',
      include: [/\.[jt]sx?$/, /\.[jt]sx?\?tsr-split/],
      resolvers: [
        iconsResolver({
          prefix: 'Icon',
          extension: 'jsx',
          alias: { lucide: 'lucide', octicon: 'octicon' },
        }),
      ],
    }),
    viteReact(),
  ],
  define: {
    __GIT_SHA__: JSON.stringify(
      process.env.GIT_SHA ??
        (() => {
          try {
            return child.execSync('git rev-parse HEAD', { stdio: 'pipe' }).toString().trim()
          } catch {
            return 'dev'
          }
        })(),
    ),
    __HOST__: JSON.stringify(getWranglerVar('HOST')),
    __SENTRY_DSN__: JSON.stringify(process.env.SENTRY_DSN ?? ''),
    __INITIAL_TOKENS_SAVED__: await (async () => {
      try {
        const dbUrl = new URL(process.env.DB_URL ?? '')
        dbUrl.searchParams.delete('sslrootcert')
        const db = createClient(dbUrl.toString(), { max: 1 })
        const result = await db
          .selectFrom('request')
          .select((eb) => eb.fn.sum<number>('tokens_saved').as('total'))
          .executeTakeFirst()
        await db.destroy()
        return String(result?.total ?? 0)
      } catch {
        return '0'
      }
    })(),
  },
}))
