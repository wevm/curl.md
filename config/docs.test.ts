import path from 'node:path'
import { expect, test } from 'vitest'
import {
  docs,
  generateDocsLlmsFullTxt,
  generateDocsLlmsTxt,
  getDocsLlmsSections,
  rewriteGeneratedDocsLinks,
} from './docs.ts'

test('rewriteGeneratedDocsLinks rewrites docs links to generated markdown paths', () => {
  expect(
    rewriteGeneratedDocsLinks(
      `
[Introduction](/docs)
[Installation](/docs/getting_started/installation)
[Quick Start](/docs/getting_started/quick_start?view=full#cli)
[Kitchen Sink](/docs/reference/kitchen_sink.md#examples)
[Guide](/guide)
[External](https://example.com/docs)
`.trim(),
    ),
  ).toBe(
    `
[Introduction](/docs/index.md)
[Installation](/docs/getting_started/installation.md)
[Quick Start](/docs/getting_started/quick_start.md?view=full#cli)
[Kitchen Sink](/docs/reference/kitchen_sink.md#examples)
[Guide](/guide)
[External](https://example.com/docs)
`.trim(),
  )
})

test('getDocsLlmsSections follows sidebar order, flattens nested groups, and skips missing docs', () => {
  const sections = getDocsLlmsSections(
    new Map([
      [
        'development/contributing',
        {
          description: 'Set up curl.md locally and run the main contributor workflows.',
          path: 'development/contributing',
          title: 'Contributing',
        },
      ],
      [
        '',
        {
          description: 'URL to markdown for agents',
          path: '',
          title: 'Introduction',
        },
      ],
      [
        'getting_started/quick_start',
        {
          description: 'Get started with curl.md',
          path: 'getting_started/quick_start',
          title: 'Quick Start',
        },
      ],
    ]),
    [
      { label: 'Introduction', path: '/', type: 'link' },
      {
        items: [
          { label: 'Installation', path: '/getting_started/installation', type: 'link' },
          { label: 'Quick Start', path: '/getting_started/quick_start', type: 'link' },
        ],
        label: 'Getting Started',
        type: 'group',
      },
      {
        items: [
          {
            items: [{ label: 'Contributing', path: '/development/contributing', type: 'link' }],
            label: 'Contributor Guide',
            type: 'group',
          },
        ],
        label: 'Development',
        type: 'group',
      },
      {
        items: [{ label: 'Missing', path: '/missing', type: 'link' }],
        label: 'Reference',
        type: 'group',
      },
    ],
  )

  expect(sections).toEqual([
    {
      docs: [{ description: 'URL to markdown for agents', path: '', title: 'Introduction' }],
      title: 'Overview',
    },
    {
      docs: [
        {
          description: 'Get started with curl.md',
          path: 'getting_started/quick_start',
          title: 'Quick Start',
        },
      ],
      title: 'Getting Started',
    },
    {
      docs: [
        {
          description: 'Set up curl.md locally and run the main contributor workflows.',
          path: 'development/contributing',
          title: 'Contributing',
        },
      ],
      title: 'Development',
    },
  ])
})

test('docsMdx does not rewrite directive syntax inside fenced code blocks', async () => {
  const code = await transformDocs(
    `
# Example

\`\`\`
:::danger Keep this literal
Danger body
:::
\`\`\`
`.trim(),
  )

  expect(code).toContain(':::danger Keep this literal')
  expect(code).not.toContain('type: "caution"')
})

test('docsMdx normalizes notice aliases when rewriting directives', async () => {
  const code = await transformDocs(
    `
# Example

:::danger Read carefully
You only need one install path.
:::
`.trim(),
  )

  expect(code).toContain('Notice')
  expect(code).toContain('type: "caution"')
  expect(code).toContain('title: "Read carefully"')
  expect(code).not.toContain(':::danger')
})

test('docsMdx leaves unterminated directives unchanged', async () => {
  const code = await transformDocs(
    `
# Example

:::steps

### Install dependencies

Run the installer before starting the app.
`.trim(),
  )

  expect(code).toContain(':::steps')
  expect(code).not.toContain('_missingMdxReference("Steps"')
  expect(code).not.toContain('_missingMdxReference("Step"')
})

test('docsMdx rewrites steps directives with tilde-fenced code blocks', async () => {
  const code = await transformDocs(
    `
# Example

:::steps

### Start the app

~~~sh
docker compose up -d
~~~

:::
`.trim(),
    'docs/development/contributing.mdx',
  )

  expect(code).toContain('Steps')
  expect(code).toContain('Step')
  expect(code).toContain('title: "Start the app"')
  expect(code).toContain('className: "language-sh"')
  expect(code).not.toContain(':::steps')
})

test('docsMdx rewrites codegroup directives into tabbed code group components', async () => {
  const code = await transformDocs(
    `
# Example

:::codegroup

\`\`\`sh [pnpm]
pnpm dev
\`\`\`

\`\`\`ts [config.ts]
export const config = {}
\`\`\`

:::
`.trim(),
  )

  expect(code).toContain('CodeGroup')
  expect(code).toContain('label: "pnpm"')
  expect(code).toContain('label: "config.ts"')
  expect(code).toContain('className: "language-sh"')
  expect(code).toContain('className: "language-ts"')
  expect(code).not.toContain('language-text')
  expect(code).not.toContain(':::codegroup')
})

test('docsMdx preserves fenced code block titles on highlighted pre elements', async () => {
  const code = await transformDocs(
    `
# Example

\`\`\`ts title="config.ts"
export const config = {}
\`\`\`
`.trim(),
  )

  expect(code).toContain('title: "config.ts"')
  expect(code).toContain('className: "language-ts"')
})

test('docsMdx strips shell prompts before highlighting prompt-style shell blocks', async () => {
  const code = await transformDocs(
    `
# Example

\`\`\`sh
$ pnpm test:e2e
\`\`\`
`.trim(),
  )

  expect(code).toContain('"data-shell-prompt": ""')
  expect(code).toContain('children: "pnpm"')
  expect(code).not.toContain('children: "$"')
})

test('docsMdx strips authored chevron shell prompts before highlighting', async () => {
  const code = await transformDocs(
    `
# Example

\`\`\`sh
❯ pnpm test:e2e
\`\`\`
`.trim(),
  )

  expect(code).toContain('"data-shell-prompt": ""')
  expect(code).toContain('children: "pnpm"')
  expect(code).not.toContain('children: "❯"')
})

test('docsMdx highlights inline code when the snippet declares a language', async () => {
  const code = await transformDocs(
    `
# Example

Use \`pnpm add curl.md{:sh}\` with \`curl.config.ts{:ts}\`.
`.trim(),
  )

  expect(code).toContain('data-shiki-inline-code')
  expect(code).toContain('children: "pnpm"')
  expect(code).not.toContain('{:sh}')
  expect(code).not.toContain('{:ts}')
})

test('docsMdx leaves raw imports untouched', async () => {
  const source = `---
title: Installation
---

# Installation

:::tip Pick one install path
You only need one installation path.
:::
`
  const code = await transformDocs(source, 'docs/getting_started/installation.mdx?raw')

  expect(code).toBe(source)
})

test('docsMdx rewrites steps directives into numbered step components', async () => {
  const code = await transformDocs(
    `
# Example

:::steps

### Install dependencies

Run the installer before starting the app.

### Start the app

\`\`\`sh
docker compose up -d
\`\`\`

:::
`.trim(),
    'docs/development/contributing.mdx',
  )

  expect(code).toContain('Steps')
  expect(code).toContain('Step')
  expect(code).toContain('title: "Install dependencies"')
  expect(code).toContain('title: "Start the app"')
  expect(code).not.toContain(':::steps')
})

test('docsMdx parses gfm tables into table elements', async () => {
  const code = await transformDocs(
    `
# Example

| Runtime | Install Command |
| --- | --- |
| Node.js | pnpm add curl.md |
`.trim(),
  )

  expect(code).toContain('_components.table')
  expect(code).toContain('_components.thead')
  expect(code).toContain('_components.tbody')
  expect(code).toContain('_components.tr')
  expect(code).toContain('_components.th')
  expect(code).toContain('_components.td')
})

test('generateDocsLlmsTxt includes the published docs in sidebar order', () => {
  const llms = generateDocsLlmsTxt({
    sections: [
      {
        docs: [{ description: 'URL to markdown for agents', path: '', title: 'Introduction' }],
        title: 'Overview',
      },
      {
        docs: [
          {
            description: 'Install the curl.md CLI',
            path: 'getting_started/installation',
            title: 'Installation',
          },
          {
            description: 'Get started with curl.md',
            path: 'getting_started/quick_start',
            title: 'Quick Start',
          },
        ],
        title: 'Getting Started',
      },
      {
        docs: [
          {
            description: 'Set up curl.md locally and run the main contributor workflows.',
            path: 'development/contributing',
            title: 'Contributing',
          },
          { description: undefined, path: 'reference/kitchen_sink', title: 'Kitchen Sink' },
        ],
        title: 'Development',
      },
    ],
  })

  expect(llms).toContain('# curl.md Docs')
  expect(llms).toContain(
    '# curl.md Docs\n\n> Canonical curl.md documentation for installation, usage, and development.',
  )
  expect(llms).toContain('## Overview')
  expect(llms).toContain(
    '## Overview\n\n- [Introduction](/docs/index.md): URL to markdown for agents',
  )
  expect(llms).toContain('## Getting Started')
  expect(llms).toContain(
    '## Getting Started\n\n- [Installation](/docs/getting_started/installation.md): Install the curl.md CLI',
  )
  expect(llms).toContain('## Development')
  expect(llms).toContain('- [Introduction](/docs/index.md): URL to markdown for agents')
  expect(llms).toContain(
    '- [Installation](/docs/getting_started/installation.md): Install the curl.md CLI',
  )
  expect(llms).toContain(
    '- [Quick Start](/docs/getting_started/quick_start.md): Get started with curl.md',
  )
  expect(llms).toContain(
    '- [Contributing](/docs/development/contributing.md): Set up curl.md locally and run the main contributor workflows.',
  )
  expect(llms).toContain('- [Kitchen Sink](/docs/reference/kitchen_sink.md): Kitchen Sink')

  expect(llms.indexOf('Introduction')).toBeLessThan(llms.indexOf('Installation'))
  expect(llms.indexOf('Installation')).toBeLessThan(llms.indexOf('Quick Start'))
  expect(llms.indexOf('Quick Start')).toBeLessThan(llms.indexOf('Contributing'))
  expect(llms.indexOf('Contributing')).toBeLessThan(llms.indexOf('Kitchen Sink'))
})

test('generateDocsLlmsFullTxt combines the docs into one markdown document', () => {
  const llmsFull = generateDocsLlmsFullTxt({
    docs: [
      {
        description: 'URL to markdown for agents',
        path: '',
        source: '# Introduction\n\nHello world.',
        title: 'Introduction',
      },
      {
        description: 'Install the curl.md CLI',
        path: 'getting_started/installation',
        source: '# Installation\n\nRun the installer.',
        title: 'Installation',
      },
    ],
  })

  expect(llmsFull).toContain('# curl.md Docs Full')
  expect(llmsFull).toContain(
    '# curl.md Docs Full\n\n> Full markdown export of the canonical curl.md documentation.',
  )
  expect(llmsFull).toContain(
    '## /docs/index.md\n\nURL to markdown for agents\n\n# Introduction\n\nHello world.',
  )
  expect(llmsFull).toContain(
    '## /docs/getting_started/installation.md\n\nInstall the curl.md CLI\n\n# Installation\n\nRun the installer.',
  )
  expect(llmsFull.indexOf('## /docs/index.md')).toBeLessThan(
    llmsFull.indexOf('## /docs/getting_started/installation.md'),
  )
})

async function transformDocs(source: string, filePath = 'docs/reference/kitchen_sink.mdx') {
  const [pathName, query = ''] = filePath.split('?', 2)
  const transformed = await docs().transform?.call(
    {},
    source,
    query ? `${path.join(process.cwd(), pathName!)}?${query}` : path.join(process.cwd(), pathName!),
  )
  return typeof transformed === 'string'
    ? transformed
    : ((transformed as { code?: string } | null | undefined)?.code ?? '')
}
