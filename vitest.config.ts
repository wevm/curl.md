import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineWorkersProject } from '@cloudflare/vitest-pool-workers/config'
import { defineConfig } from 'vitest/config'
import { Env } from './test/env.ts'

const aliases: Record<string, string> = {
  '#': new URL('./src/', import.meta.url).pathname,
}
if (existsSync('pro'))
  aliases['#lib/core'] = new URL('./pro/src/', import.meta.url).pathname

const hasPro = existsSync('pro/src')
const root = path.resolve(import.meta.dirname)
const globalSetup = ['test/globalSetup.ts']

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: aliases },
        test: {
          name: 'app',
          exclude: ['**/node_modules/**', '**/*.workers.test.ts'],
          include: [
            'src/**/*.test.ts',
            ...(hasPro ? ['pro/src/**/*.test.ts'] : []),
          ],
          root,
        },
      },
      {
        test: {
          name: 'cli',
          globalSetup,
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
          include: ['src/**/*.workers.test.ts'],
          root,
          globalSetup,
          poolOptions: {
            async workers(config) {
              const env = Env.parse(config.inject('env'))
              return {
                isolatedStorage: false,
                miniflare: {
                  bindings: env,
                  compatibilityDate: '2026-02-12',
                  compatibilityFlags: ['nodejs_compat'],
                  hyperdrives: { DB: env.DB_URL },
                  kvNamespaces: ['KV'],
                  queueProducers: { REQUEST_QUEUE: 'test-queue' },
                },
                singleWorker: true,
              }
            },
          },
        },
      }),
      ...(hasPro
        ? [
            defineWorkersProject({
              define: { __HOST__: JSON.stringify('curl.local') },
              resolve: { alias: aliases },
              test: {
                name: 'pro:workers',
                include: ['pro/src/**/*.workers.test.ts'],
                root,
                globalSetup,
                poolOptions: {
                  async workers(config) {
                    const env = Env.parse(config.inject('env'))
                    return {
                      isolatedStorage: false,
                      miniflare: {
                        bindings: env,
                        compatibilityDate: '2026-02-12',
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
          ]
        : []),
    ],
  },
})
