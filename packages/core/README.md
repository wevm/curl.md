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
const target = md.resolve('https://example.com/docs/getting-started')

// Fetch and parse to markdown
const response = await fetch(target.url, target)
const result = await md.parse(response, target)

result.content // markdown string
result.meta    // { title, description, url, ... }
```

### Custom Rules

```ts
import { resolve, parse, defineRule } from '@curl.md/core'

const resolved = resolve('https://my-docs.dev/guide', {
  rules: {
    'my-docs.dev': defineRule((url) => {
      const mdUrl = new URL(url.href)
      mdUrl.pathname = `${url.pathname}.md`
      return mdUrl
    }),
  },
})
```

### HTML to Markdown

```ts
import { fromHtml } from '@curl.md/core'

const { markdown, meta } = await fromHtml('<h1>Hello</h1><p>World</p>')
```

## License

FSL-1.1-MIT
