#!/usr/bin/env node
import cli from './cli.ts'
import { createClient } from './client.ts'
import { UpdateCache } from './utils.ts'

if (process.env.__CURLMD_UPDATE_CACHE) {
  const client = createClient(process.env.CURLMD_BASE_URL)
  await UpdateCache.runUpdate(client)
  process.exit(0)
}

cli.serve()
