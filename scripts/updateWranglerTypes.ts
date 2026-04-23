// Post-processes generated worker-configuration.d.ts:

import { readFileSync, writeFileSync } from 'node:fs'

const file = 'src/worker-configuration.d.ts'
let content = readFileSync(file, 'utf8')

// Strips `GlobalProps` (TODO: remove once fixed upstream)
// https://github.com/cloudflare/workers-sdk/issues/11454
content = content.replace(/\tinterface GlobalProps \{[^}]*\}\n/, '')

// Strips `KV` properties from Cloudflare.Env interfaces so env.d.ts can provide strongly-typed KV via TypedKV without declaration conflicts.
content = content.replace(/^\t+KV: KVNamespace;?\n/gm, '')

if (content !== readFileSync(file, 'utf8')) writeFileSync(file, content)
