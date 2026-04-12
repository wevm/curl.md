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

test('extracts data-content sections from link-heavy layouts', async () => {
  const html = `<html><head>
    <title>Installing Tailwind CSS with Vite - Tailwind CSS</title>
    <meta name="description" content="Install Tailwind CSS with Vite.">
  </head><body>
    <div>
      <a href="/docs/one">One</a>
      <a href="/docs/two">Two</a>
      <a href="/docs/three">Three</a>
      <a href="/docs/four">Four</a>
      <a href="/docs/five">Five</a>
      <a href="/docs/six">Six</a>
      <a href="/docs/seven">Seven</a>
      <a href="/docs/eight">Eight</a>
      <a href="/docs/nine">Nine</a>
      <a href="/docs/ten">Ten</a>
      <section>
        <p data-section="true">Installation</p>
        <h1>Get started with Tailwind CSS</h1>
        <p data-description="true">Tailwind CSS works by scanning all of your HTML files.</p>
        <p>It's fast, flexible, and reliable.</p>
        <div data-content="true">
          <h2>Installing Tailwind CSS as a Vite plugin</h2>
          <p>Create your project</p>
          <pre><code>npm create vite@latest my-project</code></pre>
        </div>
      </section>
      <div data-content="true">
        <p>Duplicate subtree should not be emitted twice.</p>
      </div>
    </div>
  </body></html>`

  const md = create({
    rules: [tailwind()],
    fetch: async () => new Response(html, { status: 200 }),
  })
  const result = await md.fetch('https://tailwindcss.com/docs/installation/using-vite')
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.content).toContain('Get started with Tailwind CSS')
  expect(result.content).toContain("It's fast, flexible, and reliable.")
  expect(result.content).toContain('Installing Tailwind CSS as a Vite plugin')
  expect(result.content).toContain('Create your project')
  expect(result.content).toContain('npm create vite@latest my-project')
  expect(result.content).not.toContain('Duplicate subtree should not be emitted twice.')
  expect(result.meta.title).toBe('Installing Tailwind CSS with Vite - Tailwind CSS')
  expect(result.meta.description).toBe('Install Tailwind CSS with Vite.')
})
