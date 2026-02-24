import { defineConfig } from 'evalite/config'

export default defineConfig({
  server: { port: 3006 },
  testTimeout: 60_000,
  maxConcurrency: 10,
})
