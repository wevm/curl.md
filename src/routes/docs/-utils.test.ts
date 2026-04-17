import { expect, test } from 'vitest'
import { createDocCopySource, getDocHeadings } from './-utils.ts'

const fence = '`'.repeat(3)

test('createDocCopySource strips frontmatter and rewrites notices into markdown callouts', () => {
  const source = `---
title: Installation
description: Install curl.md
---

# Installation

:::tip Pick one install path
You only need one installation path.
:::
`

  expect(createDocCopySource(source)).toBe(`# Installation

> [!TIP]
> Pick one install path
>
> You only need one installation path.`)
})

test('createDocCopySource strips top-level imports and rewrites code groups into titled fences', () => {
  const source = `# Kitchen Sink

import { create } from 'curl.md'

${fence}ts
import { rules } from 'curl.md'
${fence}

:::codegroup

${fence}sh [npm]
npm run dev
${fence}

${fence}sh [pnpm]
pnpm dev
${fence}

:::
`

  expect(createDocCopySource(source)).toBe(`# Kitchen Sink

${fence}ts
import { rules } from 'curl.md'
${fence}

${fence}sh title="npm"
npm run dev
${fence}

${fence}sh title="pnpm"
pnpm dev
${fence}`)
})

test('createDocCopySource accepts raw module objects from SSR glob imports', () => {
  expect(
    createDocCopySource({
      default: `---
title: Installation
---

# Installation`,
    }),
  ).toBe('# Installation')
})

test('createDocCopySource rewrites steps directives into ordered markdown lists', () => {
  const source = `# Contributing

:::steps

### Install and start OrbStack

OrbStack provides the local Docker runtime on macOS.

### Start the app

${fence}sh
docker compose up -d
${fence}

:::
`

  expect(createDocCopySource(source)).toBe(`# Contributing

1. Install and start OrbStack

   OrbStack provides the local Docker runtime on macOS.

2. Start the app

   ${fence}sh
   docker compose up -d
   ${fence}`)
})

test('createDocCopySource rewrites variable-length notice fences', () => {
  const source = `# Installation

::::tip Pick one install path
You only need one installation path.
::::
`

  expect(createDocCopySource(source)).toBe(`# Installation

> [!TIP]
> Pick one install path
>
> You only need one installation path.`)
})

test('createDocCopySource rewrites PluginLinks into markdown links', () => {
  const source = `# Amp

<PluginLinks npm="@curl.md/amp" source="https://github.com/wevm/curl.md/tree/main/plugins/amp" />
`

  expect(createDocCopySource(source)).toBe(`# Amp

- [@curl.md/amp](https://www.npmjs.com/package/@curl.md/amp)
- [Source code](https://github.com/wevm/curl.md/tree/main/plugins/amp)`)
})

test('getDocHeadings includes numbered step headings from nested variable-length steps fences', () => {
  const source = `## Quick Start

::::steps
### Install

Run the installer.

### Run Amp CLI

:::tip
Add PLUGINS=all to your environment.
:::

### Use Amp

Ask Amp to read a page.
::::
`

  expect(getDocHeadings(source, [{ id: 'quick-start', level: 2, text: 'Quick Start' }])).toEqual([
    { id: 'quick-start', level: 2, text: 'Quick Start' },
    { id: 'install', level: 3, text: '1. Install' },
    { id: 'run-amp-cli', level: 3, text: '2. Run Amp CLI' },
    { id: 'use-amp', level: 3, text: '3. Use Amp' },
  ])
})

test('getDocHeadings prefers numbered synthetic step headings over duplicate rendered step headings', () => {
  const source = `## Quick Start

::::steps
### Install

Run the installer.

### Use Amp

Ask Amp to read a page.
::::

## Example
`

  expect(
    getDocHeadings(source, [
      { id: 'quick-start', level: 2, text: 'Quick Start' },
      { id: 'install', level: 3, text: 'Install' },
      { id: 'use-amp', level: 3, text: 'Use Amp' },
      { id: 'example', level: 2, text: 'Example' },
    ]),
  ).toEqual([
    { id: 'quick-start', level: 2, text: 'Quick Start' },
    { id: 'install', level: 3, text: '1. Install' },
    { id: 'use-amp', level: 3, text: '2. Use Amp' },
    { id: 'example', level: 2, text: 'Example' },
  ])
})
