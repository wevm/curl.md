import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { create } from '../mod.ts'
import { tailwind } from './tailwind.ts'

const fixture = readFileSync(
  path.resolve(import.meta.dirname, '__fixtures__/tailwind-padding.html'),
  'utf8',
)

test('extract produces expected output for padding', async () => {
  const md = create({
    rules: [tailwind()],
    fetch: async () => new Response(fixture, { status: 200 }),
  })
  const result = await md.fetch('https://tailwindcss.com/docs/padding')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  await expect(result.content).toMatchFileSnapshot('__snapshots__/tailwind-padding.md')
  expect(result.meta.title).toBe('padding - Spacing - Tailwind CSS')
  expect(result.meta.description).toBe("Utilities for controlling an element's padding.")
})

test('unhides hidden tbody rows', async () => {
  const html = `<html><head>
    <title>padding - Tailwind CSS</title>
    <meta name="description" content="Utilities for controlling an element's padding.">
  </head><body>
    <table>
      <thead><tr><th>Class</th><th>Styles</th></tr></thead>
      <tbody>
        <tr><td><code>p-0</code></td><td><code>padding: 0px;</code></td></tr>
        <tr><td><code>p-px</code></td><td><code>padding: 1px;</code></td></tr>
      </tbody>
      <tbody class="col-span-2" hidden="">
        <tr><td><code>p-1</code></td><td><code>padding: 0.25rem;</code></td></tr>
        <tr><td><code>p-2</code></td><td><code>padding: 0.5rem;</code></td></tr>
      </tbody>
    </table>
    <button class="rounded-full">Show more</button>
  </body></html>`

  const md = create({
    rules: [tailwind()],
    fetch: async () => new Response(html, { status: 200 }),
  })
  const result = await md.fetch('https://tailwindcss.com/docs/padding')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toContain('p-0')
  expect(result.content).toContain('p-1')
  expect(result.content).toContain('p-2')
  expect(result.content).not.toContain('Show more')
  expect(result.meta.title).toBe('padding - Tailwind CSS')
  expect(result.meta.description).toBe("Utilities for controlling an element's padding.")
})

test('extracts meta from og tags', async () => {
  const html = `<html><head>
    <title>flex - Tailwind CSS</title>
    <meta property="og:description" content="Utilities for controlling how flex items grow and shrink.">
  </head><body><p>Content</p></body></html>`

  const md = create({
    rules: [tailwind()],
    fetch: async () => new Response(html, { status: 200 }),
  })
  const result = await md.fetch('https://tailwindcss.com/docs/flex')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.meta.title).toBe('flex - Tailwind CSS')
  expect(result.meta.description).toBe('Utilities for controlling how flex items grow and shrink.')
})
