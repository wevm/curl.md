import * as child from 'node:child_process'
import { cloudflare } from '@cloudflare/vite-plugin'
import mdx from '@mdx-js/rollup'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import remarkGfm from 'remark-gfm'
import autoImport from 'unplugin-auto-import/vite'
import iconsResolver from 'unplugin-icons/resolver'
import icons from 'unplugin-icons/vite'
import { defineConfig, type Plugin } from 'vite'
import { parse as parseYaml } from 'yaml'
import { explorerOriginRewrite, getWranglerVar } from './config/wrangler.ts'
import { createClient } from './db/client.ts'
import { Env } from './test/env.ts'

export default defineConfig(async () => ({
  server: {
    allowedHosts: ['curl.local'],
  },
  plugins: [
    tailwindcss(),
    mdxFrontmatter(),
    viteMdx(),
    // Vite/Miniflare can throw uncaught socket errors (ECONNRESET, EPIPE) during
    // SSR fetches when a client disconnects mid-request.
    // https://github.com/cloudflare/workers-sdk/issues/12047
    {
      name: 'swallow-socket-errors',
      configureServer() {
        const socketErrors = new Set(['ERR_STREAM_WRITE_AFTER_END', 'EPIPE', 'ECONNRESET'])
        process.on('uncaughtException', (err) => {
          if ('code' in err && socketErrors.has(err.code as string)) return
          // Miniflare cancels in-flight requests when the worker restarts during HMR
          if (err.message?.includes('Workers runtime canceled this request')) return
          throw err
        })
      },
    },
    explorerOriginRewrite(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      // Override bindings for tests (testcontainers DB, emulate GitHub)
      ...(process.env.PLAYWRIGHT || process.env.VITEST
        ? {
            ...(process.env.PLAYWRIGHT ? { inspectorPort: false } : {}),
            remoteBindings: false,
            config(config) {
              const parsed = Env.parse(process.env)
              const DB_URL = parsed.DB_URL
              config.hyperdrive = config.hyperdrive?.map((h) => ({
                ...h,
                localConnectionString: DB_URL,
              }))
              config.vars = { ...config.vars, ...parsed }
              // Clear secrets so they're passed as plain vars (Vite plugin drops secret_text bindings)
              delete config.secrets
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
          alias: { octicon: 'octicon', 'simple-icons': 'simple-icons' },
        }),
      ],
    }),
    viteReact({ include: [/\.[jt]sx?$/, /\.mdx?$/] }),
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
    __ORIGIN__: process.env.PLAYWRIGHT
      ? `(typeof window !== 'undefined' ? window.location.origin : 'https://${getWranglerVar('HOST')}')`
      : JSON.stringify(`https://${getWranglerVar('HOST')}`),
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

function mdxFrontmatter(): Plugin {
  return {
    enforce: 'pre',
    name: 'mdx-frontmatter',
    transform(code, id) {
      if (!/\.mdx?$/.test(id)) return

      const { content, frontmatter } = parseFrontmatter(code, id)
      return {
        code: `export const frontmatter = ${JSON.stringify(frontmatter)}\n${content}`,
        map: null,
      }
    },
  }
}

function viteMdx(): Plugin {
  const plugin = mdx({ include: /\.mdx?$/, remarkPlugins: [remarkGfm] }) as Plugin
  return { ...plugin, enforce: 'pre' }
}

function parseFrontmatter(code: string, id: string) {
  const match = code.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return { content: code, frontmatter: {} }

  const parsed = parseYaml(match[1] ?? '')
  if (parsed == null) return { content: code.slice(match[0].length), frontmatter: {} }
  if (typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(`Frontmatter in ${id} must be a YAML object`)

  return {
    content: code.slice(match[0].length),
    frontmatter: parsed,
  }
}
