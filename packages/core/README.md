# @curl.md/core

Core library for [curl.md](https://curl.md) — Fetch any URL as Markdown.

## Install

```sh
npm install @curl.md/core
```

## Usage

```ts
import * as md from '@curl.md/core'

// Resolve URL (applies builtin rules for known sites)
const resolved = md.resolve('https://example.com/docs/getting-started', md.rules)

// Fetch and parse to markdown
const response = await fetch(resolved.url, resolved)
const result = await md.parse(response, resolved)

result.content // markdown string
result.meta    // { title, description, url, ... }
```

### Builtin Rules

The `md.rules` namespace contains rules for known documentation sites (e.g. `md.rules.github`, `md.rules.cloudflare`, `md.rules.nextjs`). Pass them to `md.resolve()` to automatically resolve URLs to their raw markdown sources.

### Custom Rules

```ts
import * as md from '@curl.md/core'

const myRule = md.defineRule({
  patterns: ['my-docs.dev'],
  resolve: (url) => {
    const mdUrl = new URL(url.href)
    mdUrl.pathname = `${url.pathname}.md`
    return mdUrl
  },
})

const resolved = md.resolve('https://my-docs.dev/guide', [myRule])
```

### HTML to Markdown

```ts
import { fromHtml } from '@curl.md/core'

const { content, meta } = await fromHtml('<h1>Hello</h1><p>World</p>')
```

## License

FSL-1.1-MIT
