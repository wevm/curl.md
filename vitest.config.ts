import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  defineWorkersProject,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config'
import { defineConfig } from 'vitest/config'

const aliases: Record<string, string> = {
  '#': new URL('./src/', import.meta.url).pathname,
}
if (existsSync('pro'))
  aliases['#lib/core'] = new URL('./pro/src/', import.meta.url).pathname

const hasPro = existsSync('pro/src')
const migrationsPath = path.resolve(import.meta.dirname, 'migrations')
const migrations = await readD1Migrations(migrationsPath)
const root = path.resolve(import.meta.dirname)

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
          setupFiles: ['config/workers/apply-migrations.ts'],
          poolOptions: {
            workers: {
              // fetchPage uses waitUntil to cache in KV after responding, which conflicts with isolated storage
              isolatedStorage: false,
              miniflare: {
                bindings: { TEST_MIGRATIONS: migrations },
              },
              singleWorker: true,
              wrangler: {
                configPath: './config/workers/wrangler.jsonc',
              },
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
                poolOptions: {
                  workers: {
                    isolatedStorage: false,
                    singleWorker: true,
                    wrangler: {
                      configPath: './pro/wrangler.jsonc',
                    },
                  },
                },
              },
            }),
          ]
        : []),
    ],
  },
})
