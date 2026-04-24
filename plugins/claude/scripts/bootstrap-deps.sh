#!/bin/sh
set -eu

plugin_root=${CLAUDE_PLUGIN_ROOT:-$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)}
plugin_data=${CLAUDE_PLUGIN_DATA:-}

if [ -z "$plugin_data" ]; then
  exit 0
fi

plugin_package="$plugin_root/package.json"
data_package="$plugin_data/package.json"
plugin_node_modules="$plugin_root/node_modules"
data_node_modules="$plugin_data/node_modules"

mkdir -p "$plugin_data"

if [ ! -f "$data_package" ] || ! diff -q "$plugin_package" "$data_package" >/dev/null 2>&1; then
  cp "$plugin_package" "$data_package"

  if ! (cd "$plugin_data" && npm install --omit=dev); then
    rm -f "$data_package"
    exit 1
  fi
fi

if [ ! -e "$plugin_node_modules" ] && [ -d "$data_node_modules" ]; then
  ln -s "$data_node_modules" "$plugin_node_modules"
fi
