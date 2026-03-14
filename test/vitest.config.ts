import path from 'node:path'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
import { Env } from './env.ts'

const root = path.resolve(import.meta.dirname, '..')

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'app',
          include: ['src/**/!(*workers).test.ts'],
          root,
        },
      },
      {
        test: {
          name: 'cli',
          globalSetup: ['test/cli.globalSetup.ts'],
          setupFiles: ['test/cli.setup.ts'],
          hookTimeout: 120_000,
          include: ['pkg/src/cli/**/*.test.ts'],
          root,
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'sdk',
          include: ['pkg/src/**/*.test.ts', '!pkg/src/cli/**'],
          root,
        },
      },
      {
        define: { __HOST__: JSON.stringify('curl.local') },
        plugins: [
          cloudflareTest(async (config) => {
            const env = Env.parse(config.inject('env'))
            return {
              miniflare: {
                bindings: env,
                compatibilityDate: '2025-09-06',
                compatibilityFlags: ['nodejs_compat'],
                hyperdrives: { DB: env.DB_URL },
                kvNamespaces: ['KV'],
                queueProducers: {
                  REQUEST_QUEUE: 'test-queue',
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
