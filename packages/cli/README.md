# curl.md

CLI for [curl.md](https://curl.md) — Fetch any URL as Markdown.

```sh
# Install
npm install -g curl.md

# Usage
curl.md <url> [options]

# Also available as
md <url> [options]
curlmd <url> [options]
```

## Examples

```sh
# Fetch a page
md example.com

# Fetch with an objective to narrow results
md zod.dev/error-formatting -q "tree error formatting"

# Pre-filter by keywords
md developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch -q "streaming response body" -k ReadableStream,getReader

# Force fresh fetch (bypass cache)
md developers.cloudflare.com/d1/get-started -q "how to query D1 from a worker" -f
```

## License

MIT
