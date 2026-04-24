#!/bin/sh
set -eu

plugin_root=${CLAUDE_PLUGIN_ROOT:-$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)}
plugin_data=${CLAUDE_PLUGIN_DATA:-}

if [ ! -f "$plugin_root/src/server.ts" ]; then
  echo "curl.md Claude plugin entrypoint not found. Expected src/server.ts." >&2
  exit 1
fi

if [ -n "$plugin_data" ] && [ ! -e "$plugin_root/node_modules" ] && [ -d "$plugin_data/node_modules" ]; then
  ln -s "$plugin_data/node_modules" "$plugin_root/node_modules"
fi

exec node --experimental-strip-types --no-warnings "$plugin_root/src/server.ts"
