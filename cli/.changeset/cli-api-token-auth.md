---
'curl.md': patch
---

Added API key authentication via `--api-key` option and `CURLMD_API_KEY` environment variable. Invalid API keys now return a clear error with a CTA to create a new token.
