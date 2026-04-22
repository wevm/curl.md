import path from 'node:path'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { isAgent } from 'std-env'
import autoImport from 'unplugin-auto-import/vite'
import { FileSystemIconLoader } from 'unplugin-icons/loaders'
import iconsResolver from 'unplugin-icons/resolver'
import icons from 'unplugin-icons/vite'
import { defineConfig } from 'vitest/config'
import { docs } from '#config/docs/vite.ts'
import { Env } from './env.ts'

const root = path.resolve(import.meta.dirname, '..')

const reporters = [isAgent ? 'agent' : 'default']
if (process.env.GITHUB_ACTIONS === 'true') reporters.push('github-actions')

export default defineConfig({
  test: {
    reporters,
    projects: [
      {
        plugins: [docs()],
        test: {
          name: 'app',
          include: ['config/**/*.test.ts', 'src/**/!(*workers).test.ts'],
          exclude: ['src/md/**'],
          root,
        },
      },
      {
        test: {
          name: 'cli',
          globalSetup: ['cli/test/global.setup.ts'],
          setupFiles: ['cli/test/setup.ts'],
          hookTimeout: 60_000,
          include: ['cli/src/**/*.test.ts'],
          root,
          testTimeout: 30_000,
        },
      },
      {
        define: {
          __HOST__: JSON.stringify('curl.local'),
          __ORIGIN__: JSON.stringify('https://curl.local'),
        },
        plugins: [
          cloudflareTest(async (config) => {
            const env = Env.parse(config.inject('env'))
            return {
              miniflare: {
                bindings: env,
                compatibilityDate: '2025-10-30',
                // TODO: Remove once configurable log level is supported
                // https://github.com/cloudflare/workers-sdk/issues/12014
                compatibilityFlags: [
                  'enable_nodejs_fs_module',
                  'enable_nodejs_http_modules',
                  'enable_nodejs_perf_hooks_module',
                  'enable_nodejs_process_v2',
                  'enable_nodejs_tty_module',
                  'enable_nodejs_v8_module',
                  'nodejs_compat',
                ],
                hyperdrives: { DB: env.DB_URL },
                kvNamespaces: ['KV'],
                queueProducers: {
                  REQUEST_QUEUE: 'test-request-queue',
                  STRIPE_WEBHOOK_QUEUE: 'test-stripe-webhook-queue',
                },
                serviceBindings: {
                  ASSETS: () => new Response(null, { status: 404 }),
                },
              },
            }
          }),
        ],
        test: {
          name: 'workers',
          include: ['src/**/*.workers.test.ts'],
          root,
          globalSetup: ['test/workers.global.setup.ts'],
          setupFiles: ['test/workers.setup.ts'],
        },
      },
      {
        plugins: [
          icons({
            compiler: 'jsx',
            customCollections: {
              brand: FileSystemIconLoader(path.resolve(root, 'config/icons/brand')),
            },
            jsx: 'react',
          }),
          autoImport({
            dts: false,
            include: [/\.[jt]sx?$/],
            resolvers: [
              iconsResolver({
                prefix: 'Icon',
                extension: 'jsx',
                alias: { octicon: 'octicon', 'simple-icons': 'simple-icons' },
              }),
            ],
          }),
          react(),
        ],
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: 'chromium' }],
            provider: playwright(),
          },
          include: ['src/**/*.browser.test.tsx'],
          name: 'browser',
          root,
        },
      },
      {
        test: {
          name: 'md',
          include: ['src/md/**/*.test.ts'],
          exclude: ['**/*.smoke.test.ts'],
          root,
        },
      },
      {
        test: {
          name: 'md:smoke',
          include: ['src/md/**/*.smoke.test.ts'],
          root,
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'plugins:amp',
          include: ['plugins/amp/**/*.test.ts'],
          root,
        },
      },
      {
        test: {
          name: 'plugins:opencode',
          include: ['plugins/opencode/**/*.test.ts'],
          root,
        },
      },
      {
        test: {
          name: 'plugins:pi',
          include: ['plugins/pi/**/*.test.ts'],
          root,
          setupFiles: ['plugins/pi/test/setup.ts'],
        },
      },
    ],
  },
})
