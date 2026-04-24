#!/bin/sh
set -eu

plugin_root=${CLAUDE_PLUGIN_ROOT:-$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)}

if [ -f "$plugin_root/src/server.ts" ]; then
  exec node --experimental-strip-types --no-warnings "$plugin_root/src/server.ts"
fi

if [ -f "$plugin_root/dist/server.js" ]; then
  exec node "$plugin_root/dist/server.js"
fi

echo "curl.md Claude plugin entrypoint not found. Expected src/server.ts for local development or dist/server.js for published installs." >&2
exit 1
