// TODO: Inline into root vitest.config.ts once `@cloudflare/vitest-pool-workers` supports vitest v4
// https://github.com/cloudflare/workers-sdk/issues/11064
// https://github.com/cloudflare/workers-sdk/pull/11632

import path from 'node:path'
import {
  defineWorkersConfig,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config'

const migrationsPath = path.resolve(import.meta.dirname, '../../migrations')
const migrations = await readD1Migrations(migrationsPath)

export default defineWorkersConfig({
  resolve: {
    alias: {
      '#': new URL('../../src/', import.meta.url).pathname,
    },
  },
  test: {
    include: ['../../src/**/*.workers.test.ts'],
    name: 'workers',
    setupFiles: ['./apply-migrations.ts'],
    poolOptions: {
      workers: {
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
        singleWorker: true,
        wrangler: {
          configPath: './wrangler.jsonc',
        },
      },
    },
  },
})
