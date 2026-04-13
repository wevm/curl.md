import path from 'node:path'
import { expect, test } from 'vitest'
import { docsMdx } from '../../../config/docs.ts'

test('docs mdx rewrites codegroup directives into tabbed code group components', async () => {
  const plugin = await docsMdx()
  const source = `# Example

:::codegroup

\`\`\`sh [pnpm]
pnpm dev
\`\`\`

\`\`\`ts [config.ts]
export const config = {}
\`\`\`

:::
`

  const transformed = await plugin.transform?.call(
    {},
    source,
    path.join(process.cwd(), 'docs/reference/kitchen_sink.mdx'),
  )
  const code =
    typeof transformed === 'string'
      ? transformed
      : (transformed as { code?: string } | null | undefined)?.code

  expect(code).toContain('CodeGroup')
  expect(code).toContain('label: "pnpm"')
  expect(code).toContain('label: "config.ts"')
  expect(code).toContain('className: "language-sh"')
  expect(code).toContain('className: "language-ts"')
  expect(code).not.toContain('language-text')
  expect(code).not.toContain(':::codegroup')
})

test('docs mdx preserves fenced code block titles on highlighted pre elements', async () => {
  const plugin = await docsMdx()
  const source = `# Example

\`\`\`ts title="config.ts"
export const config = {}
\`\`\`
`

  const transformed = await plugin.transform?.call(
    {},
    source,
    path.join(process.cwd(), 'docs/reference/kitchen_sink.mdx'),
  )
  const code =
    typeof transformed === 'string'
      ? transformed
      : (transformed as { code?: string } | null | undefined)?.code

  expect(code).toContain('title: "config.ts"')
  expect(code).toContain('className: "language-ts"')
})

test('docs mdx strips shell prompts before highlighting prompt-style shell blocks', async () => {
  const plugin = await docsMdx()
  const source = `# Example

\`\`\`sh
$ pnpm test:e2e
\`\`\`
`

  const transformed = await plugin.transform?.call(
    {},
    source,
    path.join(process.cwd(), 'docs/reference/kitchen_sink.mdx'),
  )
  const code =
    typeof transformed === 'string'
      ? transformed
      : (transformed as { code?: string } | null | undefined)?.code

  expect(code).toContain('"data-shell-prompt": ""')
  expect(code).toContain('children: "pnpm"')
  expect(code).not.toContain('children: "$"')
})

test('docs mdx highlights inline code when the snippet declares a language', async () => {
  const plugin = await docsMdx()
  const source = `# Example

Use \`pnpm add curl.md{:sh}\` with \`curl.config.ts{:ts}\`.
`

  const transformed = await plugin.transform?.call(
    {},
    source,
    path.join(process.cwd(), 'docs/reference/kitchen_sink.mdx'),
  )
  const code =
    typeof transformed === 'string'
      ? transformed
      : (transformed as { code?: string } | null | undefined)?.code

  expect(code).toContain('data-shiki-inline-code')
  expect(code).toContain('children: "pnpm"')
  expect(code).not.toContain('{:sh}')
  expect(code).not.toContain('{:ts}')
})

test('docs mdx leaves raw imports untouched', async () => {
  const plugin = await docsMdx()
  const source = `---
title: Installation
---

# Installation

:::tip Pick one install path
You only need one installation path.
:::
`

  const transformed = await plugin.transform?.call(
    {},
    source,
    `${path.join(process.cwd(), 'docs/getting_started/installation.mdx')}?raw`,
  )
  const code =
    typeof transformed === 'string'
      ? transformed
      : (transformed as { code?: string } | null | undefined)?.code

  expect(code).toBe(source)
})

test('docs mdx rewrites steps directives into numbered step components', async () => {
  const plugin = await docsMdx()
  const source = `# Example

:::steps

### Install dependencies

Run the installer before starting the app.

### Start the app

\`\`\`sh
docker compose up -d
\`\`\`

:::
`

  const transformed = await plugin.transform?.call(
    {},
    source,
    path.join(process.cwd(), 'docs/development/contributing.mdx'),
  )
  const code =
    typeof transformed === 'string'
      ? transformed
      : (transformed as { code?: string } | null | undefined)?.code

  expect(code).toContain('Steps')
  expect(code).toContain('Step')
  expect(code).toContain('title: "Install dependencies"')
  expect(code).toContain('title: "Start the app"')
  expect(code).not.toContain(':::steps')
})

test('docs mdx parses gfm tables into table elements', async () => {
  const plugin = await docsMdx()
  const source = `# Example

| Runtime | Install Command |
| --- | --- |
| Node.js | pnpm add curl.md |
`

  const transformed = await plugin.transform?.call(
    {},
    source,
    path.join(process.cwd(), 'docs/reference/kitchen_sink.mdx'),
  )
  const code =
    typeof transformed === 'string'
      ? transformed
      : (transformed as { code?: string } | null | undefined)?.code

  expect(code).toContain('_components.table')
  expect(code).toContain('_components.thead')
  expect(code).toContain('_components.tbody')
  expect(code).toContain('_components.tr')
  expect(code).toContain('_components.th')
  expect(code).toContain('_components.td')
})
