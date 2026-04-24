#!/bin/sh
set -eu

case "${CLAUDE_PLUGIN_OPTION_webfetch_redirect:-}" in
  1|[Tt][Rr][Uu][Ee]) ;;
  *) exit 0 ;;
esac

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Use curl_md instead of WebFetch for URL reads. Retry this request with curl_md using the same url, and map the WebFetch prompt to curl_md objective."
  }
}
EOF
