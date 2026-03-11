import path from 'node:path'
import { defineWorkersProject } from '@cloudflare/vitest-pool-workers/config'
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
      defineWorkersProject({
        define: { __HOST__: JSON.stringify('curl.local') },
        resolve: { alias: aliases },
        test: {
          name: 'workers',
          include: ['src/**/*.workers.test.ts'],
          root,
          globalSetup: ['test/workers.globalSetup.ts'],
          setupFiles: ['test/workers.setup.ts'],
          poolOptions: {
            async workers(config) {
              const env = Env.parse(config.inject('env'))
              return {
                isolatedStorage: false,
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
                singleWorker: true,
              }
            },
          },
        },
      }),
    ],
  },
})
