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
