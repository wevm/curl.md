#!/bin/sh
set -eu

plugin_root=${CLAUDE_PLUGIN_ROOT:-$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)}

if [ ! -d "$plugin_root/node_modules/@modelcontextprotocol" ] || [ ! -d "$plugin_root/node_modules/curl.md" ] || [ ! -d "$plugin_root/node_modules/zod" ]; then
  echo "Installing curl.md Claude plugin dependencies..." >&2
  (
    cd "$plugin_root"
    npm install --ignore-scripts --no-audit --no-fund --omit=dev --silent
  )
fi

exec node --experimental-strip-types --no-warnings "$plugin_root/src/server.ts"
