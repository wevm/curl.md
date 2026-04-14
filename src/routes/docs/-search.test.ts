import { expect, test } from 'vitest'
import { createDocsSearch } from './-search.ts'

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

test('doc search omits stopwords from preview highlight terms', () => {
  const docsSearch = createDocsSearch(
    [
      {
        description: undefined,
        headings: [{ id: 'open-curlmd-locally', level: 3, text: '4. Open curl.md locally' }],
        path: 'development/contributing',
        source: `### 4. Open curl.md locally

Open https://curl.local or request a page directly:

\`\`\`sh
$ curl curl.local/example.com
\`\`\`
`,
        title: 'Contributing',
      },
    ],
    ['development/contributing'],
  )

  const result = docsSearch
    .search('request a page directly')
    .find((entry) => entry.kind === 'section' && entry.hash === 'open-curlmd-locally')

  expect(result).toBeDefined()
  expect(result?.terms).toEqual(expect.arrayContaining(['directly', 'page', 'request']))
  expect(result?.terms).not.toContain('a')
})

test('doc search keeps exact phrase matches so stopwords still highlight in previews', () => {
  const docsSearch = createDocsSearch(
    [
      {
        description: undefined,
        headings: [
          { id: 'copy-the-environment-file', level: 3, text: '2. Copy the environment file' },
        ],
        path: 'development/contributing',
        source: `### 2. Copy the environment file

Copy the environment file before starting the app.
`,
        title: 'Contributing',
      },
    ],
    ['development/contributing'],
  )

  const result = docsSearch
    .search('copy the environment file')
    .find((entry) => entry.kind === 'section' && entry.hash === 'copy-the-environment-file')

  expect(result).toBeDefined()
  expect(result?.terms).toEqual(expect.arrayContaining(['copy the environment file']))
  expect(result?.terms).not.toContain('the')
})

test('doc search preserves punctuation query tokens for preview highlights', () => {
  const docsSearch = createDocsSearch(
    [
      {
        description: undefined,
        headings: [{ id: 'pi-extension', level: 2, text: 'Pi Extension' }],
        path: 'plugins/pi',
        source: `## Pi Extension

Use md_login, md_logout, and md_status inside Pi.
`,
        title: 'Pi',
      },
    ],
    ['plugins/pi'],
  )

  const result = docsSearch
    .search('md_')
    .find((entry) => entry.kind === 'section' && entry.hash === 'pi-extension')

  expect(result).toBeDefined()
  expect(result?.terms).toEqual(expect.arrayContaining(['md_']))
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
