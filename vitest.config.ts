import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

const aliases: Record<string, string> = {
  '#': new URL('./src/', import.meta.url).pathname,
}
if (existsSync('pro'))
  aliases['#lib/core'] = new URL('./pro/src/', import.meta.url).pathname

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: aliases },
        test: {
          name: 'app',
          // TODO: Remove once `@cloudflare/vitest-pool-workers` supports vitest v4 and `config/workers` is inlined
          // https://github.com/cloudflare/workers-sdk/issues/11064
          exclude: ['**/node_modules/**', 'src/**/*.workers.test.ts'],
          include: ['src/**/*.test.ts'],
          root: path.resolve(import.meta.dirname),
        },
      },
      {
        test: {
          name: 'cli',
          include: ['cli/src/**/*.test.ts'],
          globalSetup: ['cli/global-setup.ts'],
          root: path.resolve(import.meta.dirname),
          testTimeout: 30_000,
        },
      },
    ],
  },
})
