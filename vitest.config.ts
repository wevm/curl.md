import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineWorkersProject } from '@cloudflare/vitest-pool-workers/config'
import { defineConfig } from 'vitest/config'
import { Env } from './test/env.ts'

const hasPro = existsSync('pro/src')

const aliases: Record<string, string> = {
  '#': new URL('./src/', import.meta.url).pathname,
  ...(hasPro && {
    '#lib/core': new URL('./pro/src/', import.meta.url).pathname,
  }),
}
const root = path.resolve(import.meta.dirname)

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: aliases },
        test: {
          name: 'app',
          include: [
            'src/**/!(*workers).test.ts',
            ...(hasPro ? ['pro/src/**/!(*workers).test.ts'] : []),
          ],
          root,
        },
      },
      {
        test: {
          name: 'cli',
          globalSetup: ['test/cli.globalSetup.ts'],
          setupFiles: ['test/cli.setup.ts'],
          hookTimeout: 120_000,
          include: ['cli/src/**/*.test.ts'],
          root,
          testTimeout: 30_000,
        },
      },
      defineWorkersProject({
        define: { __HOST__: JSON.stringify('curl.local') },
        resolve: { alias: aliases },
        test: {
          name: 'workers',
          include: [
            'src/**/*.workers.test.ts',
            ...(hasPro ? ['pro/src/**/*.workers.test.ts'] : []),
          ],
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
                  queueProducers: { REQUEST_QUEUE: 'test-queue' },
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
