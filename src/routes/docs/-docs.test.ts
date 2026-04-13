import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { getDocHeadings } from './-headings.ts'
import { createDocsSearch } from './-search.ts'

test('contributing doc headings include numbered steps in outline order', () => {
  const rawSource = readFileSync(
    path.join(process.cwd(), 'docs/development/contributing.mdx'),
    'utf8',
  )

  const headings = getDocHeadings(rawSource, [
    { id: 'prerequisites', level: 2, text: 'Prerequisites' },
    { id: 'local-setup', level: 2, text: 'Local Setup' },
    { id: 'daily-workflow', level: 2, text: 'Daily Workflow' },
    { id: 'checks', level: 2, text: 'Checks' },
    { id: 'docs', level: 2, text: 'Docs' },
  ])

  expect(headings).toEqual([
    { id: 'prerequisites', level: 2, text: 'Prerequisites' },
    { id: 'local-setup', level: 2, text: 'Local Setup' },
    { id: 'install-and-start-orbstack', level: 3, text: '1. Install and start OrbStack' },
    { id: 'copy-the-environment-file', level: 3, text: '2. Copy the environment file' },
    {
      id: 'start-the-app-with-docker-compose',
      level: 3,
      text: '3. Start the app with Docker Compose',
    },
    { id: 'open-curlmd-locally', level: 3, text: '4. Open curl.md locally' },
    { id: 'daily-workflow', level: 2, text: 'Daily Workflow' },
    { id: 'checks', level: 2, text: 'Checks' },
    { id: 'docs', level: 2, text: 'Docs' },
  ])
})

test('doc search finds heading anchors and body matches', () => {
  const docsSearch = createDocsSearch(
    [
      {
        description:
          'Use this page to get a local curl.md development environment running and to find the commands used most often while contributing.',
        headings: [
          { id: 'prerequisites', level: 2, text: 'Prerequisites' },
          { id: 'local-setup', level: 2, text: 'Local Setup' },
          {
            id: 'start-the-app-with-docker-compose',
            level: 3,
            text: '3. Start the app with Docker Compose',
          },
          { id: 'open-curlmd-locally', level: 3, text: '4. Open curl.md locally' },
        ],
        path: 'development/contributing',
        source: `## Prerequisites

OrbStack for local Docker support on macOS.

## Local Setup

3. Start the app with Docker Compose

   Run docker compose up -d.

4. Open curl.md locally

   Open curl.local in your browser.
`,
        title: 'Contributing',
      },
    ],
    ['development/contributing'],
  )

  expect(docsSearch.search('prerequisites')).toContainEqual(
    expect.objectContaining({
      hash: 'prerequisites',
      kind: 'section',
      path: 'development/contributing',
      snippet: 'OrbStack for local Docker support on macOS.',
      title: 'Contributing',
    }),
  )

  expect(docsSearch.search('docker compose')).toContainEqual(
    expect.objectContaining({
      kind: 'page',
      path: 'development/contributing',
      title: 'Contributing',
    }),
  )

  expect(docsSearch.search('docker compose')).toContainEqual(
    expect.objectContaining({
      hash: 'start-the-app-with-docker-compose',
      kind: 'section',
      snippet: 'Run docker compose up -d.',
    }),
  )

  expect(docsSearch.search('commands used most often')).toContainEqual(
    expect.objectContaining({
      hash: 'prerequisites',
      kind: 'section',
      snippet: 'OrbStack for local Docker support on macOS.',
    }),
  )

  expect(docsSearch.search('docker compose')).toContainEqual(
    expect.objectContaining({
      kind: 'page',
      snippet:
        'Use this page to get a local curl.md development environment running and to find the commands used most often while contributing.',
    }),
  )

  expect(docsSearch.search('open curl.md locally')).toContainEqual(
    expect.objectContaining({
      hash: 'open-curlmd-locally',
      path: 'development/contributing',
      sectionPath: ['Local Setup', '4. Open curl.md locally'],
    }),
  )
})

test('doc search tolerates common spelling mistakes', () => {
  const docsSearch = createDocsSearch(
    [
      {
        description: undefined,
        headings: [
          {
            id: 'start-the-app-with-docker-compose',
            level: 3,
            text: '3. Start the app with Docker Compose',
          },
        ],
        path: 'development/contributing',
        source: `### 3. Start the app with Docker Compose

Run docker compose up -d.
`,
        title: 'Contributing',
      },
    ],
    ['development/contributing'],
  )

  expect(docsSearch.search('dcoker')).toContainEqual(
    expect.objectContaining({
      kind: 'section',
      path: 'development/contributing',
      snippet: 'Run docker compose up -d.',
      terms: ['docker'],
    }),
  )
})

test('doc search strips code fence markers from snippets', () => {
  const docsSearch = createDocsSearch(
    [
      {
        description: undefined,
        headings: [{ id: 'code-blocks', level: 2, text: 'Code Blocks' }],
        path: 'reference/kitchen_sink',
        source: `## Code Blocks

\`\`\`sh
$ curl.md https://example.com
\`\`\`

\`\`\`json
{
  "runtime": "node",
  "watch": true
}
\`\`\`
`,
        title: 'Kitchen Sink',
      },
    ],
    ['reference/kitchen_sink'],
  )

  const results = docsSearch.search('curl.md example')
  expect(results).toContainEqual(
    expect.objectContaining({
      hash: 'code-blocks',
      kind: 'section',
      path: 'reference/kitchen_sink',
    }),
  )

  const section = results.find((r) => r.kind === 'section' && r.hash === 'code-blocks')
  expect(section?.snippet).toBeDefined()
  expect(section?.snippet).toContain('curl.md')
})

test('doc search indexes step headings from :::steps as sections', () => {
  const docsSearch = createDocsSearch(
    [
      {
        description: undefined,
        headings: [
          { id: 'steps', level: 2, text: 'Steps' },
          { id: 'install-dependencies', level: 3, text: '1. Install dependencies' },
          { id: 'start-the-dev-server', level: 3, text: '2. Start the dev server' },
          { id: 'open-the-app', level: 3, text: '3. Open the app' },
        ],
        path: 'reference/kitchen_sink',
        source: `## Steps

:::steps

### Install dependencies

Use your preferred package manager to install project dependencies.

### Start the dev server

\`\`\`sh
$ pnpm dev
\`\`\`

### Open the app

Visit [https://curl.local](https://curl.local) once the server is running.

:::
`,
        title: 'Kitchen Sink',
      },
    ],
    ['reference/kitchen_sink'],
  )

  const results = docsSearch.search('install dependencies')
  expect(results).toContainEqual(
    expect.objectContaining({
      hash: 'install-dependencies',
      kind: 'section',
      sectionPath: ['Steps', '1. Install dependencies'],
    }),
  )

  const devServerResults = docsSearch.search('pnpm dev')
  const devServerSection = devServerResults.find(
    (r) => r.kind === 'section' && r.hash === 'start-the-dev-server',
  )
  expect(devServerSection).toBeDefined()
  expect(devServerSection?.snippet).toBeDefined()
  expect(devServerSection?.snippet).toContain('pnpm dev')
})

test('doc search step body snippet does not leak into sibling steps', () => {
  const docsSearch = createDocsSearch(
    [
      {
        description: undefined,
        headings: [
          { id: 'install-dependencies', level: 3, text: '1. Install dependencies' },
          { id: 'start-the-dev-server', level: 3, text: '2. Start the dev server' },
        ],
        path: 'test',
        source: `### Install dependencies

Use your preferred package manager to install project dependencies.

### Start the dev server

\`\`\`sh
$ pnpm dev
\`\`\`
`,
        title: 'Test',
      },
    ],
    ['test'],
  )

  const results = docsSearch.search('install dependencies')
  const installSection = results.find(
    (r) => r.kind === 'section' && r.hash === 'install-dependencies',
  )
  expect(installSection).toBeDefined()
  expect(installSection?.snippet).not.toContain('pnpm dev')
})

test('doc search ignores package manager codegroup tabs', () => {
  const docsSearch = createDocsSearch(
    [
      {
        description: undefined,
        headings: [{ id: 'code-groups', level: 2, text: 'Code Groups' }],
        path: 'reference/kitchen_sink',
        source: `## Code Groups

\`\`\`sh title="npm"
npm run dev
\`\`\`

\`\`\`sh title="pnpm"
pnpm dev
\`\`\`

\`\`\`sh title="bun"
bun run dev
\`\`\`

Use the install script if you do not want to use a package manager.
`,
        title: 'Kitchen Sink',
      },
    ],
    ['reference/kitchen_sink'],
  )

  expect(docsSearch.search('npm')).toEqual([])
  expect(docsSearch.search('pnpm')).toEqual([])
  expect(docsSearch.search('bun')).toEqual([])
  expect(docsSearch.search('install script')).toContainEqual(
    expect.objectContaining({
      hash: 'code-groups',
      kind: 'section',
      path: 'reference/kitchen_sink',
    }),
  )
})

test('kitchen sink doc headings include numbered steps in outline order', () => {
  const rawSource = readFileSync(
    path.join(process.cwd(), 'docs/reference/kitchen_sink.mdx'),
    'utf8',
  )

  const headings = getDocHeadings(rawSource, [
    { id: 'headings', level: 2, text: 'Headings' },
    { id: 'level-3-heading', level: 3, text: 'Level 3 Heading' },
    { id: 'level-4-heading', level: 4, text: 'Level 4 Heading' },
    { id: 'paragraphs-and-links', level: 2, text: 'Paragraphs And Links' },
    { id: 'notices', level: 2, text: 'Notices' },
    { id: 'lists', level: 2, text: 'Lists' },
    { id: 'blockquotes', level: 2, text: 'Blockquotes' },
    { id: 'code-blocks', level: 2, text: 'Code Blocks' },
    { id: 'code-groups', level: 2, text: 'Code Groups' },
    { id: 'tables', level: 2, text: 'Tables' },
    { id: 'steps', level: 2, text: 'Steps' },
    { id: 'horizontal-rule', level: 2, text: 'Horizontal Rule' },
  ])

  expect(headings).toEqual([
    { id: 'headings', level: 2, text: 'Headings' },
    { id: 'level-3-heading', level: 3, text: 'Level 3 Heading' },
    { id: 'level-4-heading', level: 4, text: 'Level 4 Heading' },
    { id: 'paragraphs-and-links', level: 2, text: 'Paragraphs And Links' },
    { id: 'notices', level: 2, text: 'Notices' },
    { id: 'lists', level: 2, text: 'Lists' },
    { id: 'blockquotes', level: 2, text: 'Blockquotes' },
    { id: 'code-blocks', level: 2, text: 'Code Blocks' },
    { id: 'code-groups', level: 2, text: 'Code Groups' },
    { id: 'tables', level: 2, text: 'Tables' },
    { id: 'steps', level: 2, text: 'Steps' },
    { id: 'install-dependencies', level: 3, text: '1. Install dependencies' },
    { id: 'start-the-dev-server', level: 3, text: '2. Start the dev server' },
    { id: 'open-the-app', level: 3, text: '3. Open the app' },
    { id: 'horizontal-rule', level: 2, text: 'Horizontal Rule' },
  ])
})
