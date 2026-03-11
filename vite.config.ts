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

export default defineConfig({
  server: {
    allowedHosts: ['curl.local'],
  },
  plugins: [
    tailwindcss(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      // Override localConnectionString for CLI tests (testcontainers uses a random port)
      ...(process.env.DB_URL && process.env.VITEST
        ? {
            config(config) {
              config.hyperdrive = config.hyperdrive?.map((h) => ({
                ...h,
                localConnectionString: process.env.DB_URL,
              }))
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
            return child
              .execSync('git rev-parse HEAD', { stdio: 'pipe' })
              .toString()
              .trim()
          } catch {
            return 'dev'
          }
        })(),
    ),
    __HOST__: JSON.stringify(getWranglerVar('HOST')),
    __SENTRY_DSN__: JSON.stringify(process.env.SENTRY_DSN ?? ''),
    __INITIAL_TOKENS_SAVED__: (() => {
      try {
        return child
          .execSync(
            'node --experimental-strip-types scripts/getTokensSaved.ts',
            { stdio: 'pipe' },
          )
          .toString()
          .trim()
      } catch {
        return '0'
      }
    })(),
  },
})
