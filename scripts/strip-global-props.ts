// TODO: Remove once fixed upstream
// https://github.com/cloudflare/workers-sdk/issues/11454
//
// Strips `GlobalProps` from generated worker-configuration.d.ts.
// GlobalProps contains `mainModule: typeof import("./entry-server")` which
// creates a transitive dependency on the entire app when included in tsconfigs
// that only need Cloudflare.Env (e.g., worker test configs).

import { readFileSync, writeFileSync } from 'node:fs'

const file = 'src/worker-configuration.d.ts'
const content = readFileSync(file, 'utf8')
const stripped = content.replace(/\tinterface GlobalProps \{[^}]*\}\n/, '')
if (stripped !== content) writeFileSync(file, stripped)
