# curl.md

Fetch any URL as Markdown.

## CLI

```sh
# Install
npm install -g curl.md

# Usage
curl.md <url> [options]

# Also available as
md <url> [options]
curlmd <url> [options]
```

### Examples

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

## SDK

```sh
npm install curl.md
```

```ts
import * as Md from 'curl.md'

const md = Md.create({
  headers: { 'User-Agent': 'my-app/1.0' },
  rules: Md.rules,
})

const result = await md.fetch('https://example.com')
if (result.ok) {
  console.log(result.content) // Markdown string
  console.log(result.meta) // { title, description, url, site, ... }
}
```
