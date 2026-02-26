import * as child from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
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
  resolve: {
    alias: {
      ...(existsSync('pro/src')
        ? { '#lib/core': resolve(__dirname, 'pro/src') }
        : {}),
    },
  },
  server: {
    allowedHosts: ['curl.local'],
  },
  plugins: [
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
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
    __INITIAL_TOKENS_SAVED__: (() => {
      try {
        const env = process.env.CLOUDFLARE_ENV
        const flags =
          env === 'production'
            ? '--remote --env production'
            : env === 'preview'
              ? '--remote --env preview'
              : '--local'
        return child
          .execSync(
            `node --experimental-strip-types scripts/get-tokens-saved.ts ${flags}`,
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
