// Post-processes generated worker-configuration.d.ts:
// 1. Strips `GlobalProps` (TODO: remove once fixed upstream)
//    https://github.com/cloudflare/workers-sdk/issues/11454
// 2. Strips `KV` properties from Cloudflare.Env interfaces so env.d.ts
//    can provide strongly-typed KV via TypedKV without declaration conflicts.

import { readFileSync, writeFileSync } from 'node:fs'

const file = 'src/worker-configuration.d.ts'
let content = readFileSync(file, 'utf8')
content = content.replace(/\tinterface GlobalProps \{[^}]*\}\n/, '')
content = content.replace(/^\t+KV: KVNamespace;?\n/gm, '')
content = content.replace(/^\t+DB_URL: string;?\n/gm, '')
content = content.replace(/^\t+CURLMD_BASE_URL: string;?\n/gm, '')
content = content.replace(/^\t+WRANGLER_SEND_METRICS: string;?\n/gm, '')
for (const key of ['DB_URL', 'CURLMD_BASE_URL', 'WRANGLER_SEND_METRICS'])
  content = content.replace(new RegExp(`\\s*\\|\\s*"${key}"|"${key}"\\s*\\|\\s*`, 'g'), '')
if (content !== readFileSync(file, 'utf8')) writeFileSync(file, content)
