import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { getDocHeadings } from './-headings.ts'

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
