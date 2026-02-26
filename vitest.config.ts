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
          exclude: ['**/node_modules/**'],
          include: ['src/**/*.test.ts'],
          root: path.resolve(import.meta.dirname),
        },
      },
      {
        resolve: { alias: aliases },
        test: {
          name: 'pro',
          exclude: ['**/node_modules/**'],
          include: ['pro/src/**/*.test.ts'],
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
