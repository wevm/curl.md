#!/usr/bin/env node
import { hc } from 'hono/client'
import type { api } from '../../../src/api.ts'
import cli from './cli.ts'
import { UpdateCache } from './utils.ts'

if (process.env.__CURL_MD_UPDATE_CACHE) {
  const client = hc<typeof api>(
    process.env.CURL_MD_BASE_URL || 'https://curl.md',
  )
  await UpdateCache.runUpdate(client)
  process.exit(0)
}

cli.serve()
