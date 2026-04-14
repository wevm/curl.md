import { expect, test } from 'vitest'
import { createDocCopySource } from './-utils.ts'

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
