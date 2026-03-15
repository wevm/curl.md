import path from 'node:path'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
import { Env } from './env.ts'

const root = path.resolve(import.meta.dirname, '..')
const aliases = {
  '#': new URL('../src/', import.meta.url).pathname,
}

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: aliases },
        test: {
          name: 'app',
          include: ['src/**/!(*workers).test.ts'],
          root,
        },
      },
      {
        test: {
          name: 'cli',
          globalSetup: ['cli/test/globalSetup.ts'],
          setupFiles: ['cli/test/setup.ts'],
          hookTimeout: 60_000,
          include: ['cli/src/**/*.test.ts'],
          root,
          testTimeout: 30_000,
        },
      },
      {
        define: { __HOST__: JSON.stringify('curl.local') },
        resolve: {
          alias: aliases,
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
          globalSetup: ['test/workers.globalSetup.ts'],
          setupFiles: ['test/workers.setup.ts'],
        },
      },
    ],
  },
})
