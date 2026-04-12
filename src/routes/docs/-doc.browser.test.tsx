import * as React from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { DocContent } from './-doc.tsx'
import type { Doc, DocPagination } from './-doc.types.ts'

let cleanup: (() => void) | undefined

afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

test('outline has no active heading on initial load without a hash', async () => {
  const rendered = renderDocContent(createDoc())

  await expect
    .element(rendered.outline.getByText('CLI', { exact: true }))
    .not.toHaveAttribute('data-active')
})

test('outline does not jump to the last heading when scrolling quickly to the middle', async () => {
  const rendered = renderDocContent(createDoc())
  const bunHeading = document.getElementById('bun')
  if (!bunHeading) throw new Error('Expected bun heading to exist')

  window.scrollTo({ top: bunHeading.offsetTop - 80 })

  await expect
    .element(rendered.outline.getByText('Bun', { exact: true }))
    .toHaveAttribute('data-active')
  await expect
    .element(rendered.outline.getByText('Authentication', { exact: true }))
    .not.toHaveAttribute('data-active')
})

test('outline does not force the last heading active near the bottom when more content follows', async () => {
  const rendered = renderDocContent(createDoc())
  const piExtensionHeading = document.getElementById('pi-extension')
  if (!piExtensionHeading) throw new Error('Expected pi extension heading to exist')

  window.scrollTo({ top: piExtensionHeading.offsetTop - 80 })

  await expect
    .element(rendered.outline.getByText('Pi Extension', { exact: true }))
    .toHaveAttribute('data-active')
  await expect
    .element(rendered.outline.getByText('Authentication', { exact: true }))
    .not.toHaveAttribute('data-active')
})

test('outline clears stale last-heading state after a quick upward scroll', async () => {
  const rendered = renderDocContent(createDoc())
  const authenticationHeading = document.getElementById('authentication')
  const piExtensionHeading = document.getElementById('pi-extension')
  if (!authenticationHeading) throw new Error('Expected authentication heading to exist')
  if (!piExtensionHeading) throw new Error('Expected pi extension heading to exist')

  window.scrollTo({ top: authenticationHeading.offsetTop - 80 })
  await waitForAnimationFrame()

  await expect
    .element(rendered.outline.getByText('Authentication', { exact: true }))
    .toHaveAttribute('data-active')

  window.scrollTo({ top: piExtensionHeading.offsetTop - 80 })
  await waitForAnimationFrame()

  await expect
    .element(rendered.outline.getByText('Pi Extension', { exact: true }))
    .toHaveAttribute('data-active')
  await expect
    .element(rendered.outline.getByText('Authentication', { exact: true }))
    .not.toHaveAttribute('data-active')
})

function createDoc(): Doc {
  const sections = [
    { id: 'cli', level: 2, spacerBlockSizePx: 480, tag: 'h2', text: 'CLI' },
    {
      id: 'package-managers',
      level: 3,
      spacerBlockSizePx: 480,
      tag: 'h3',
      text: 'Package Managers',
    },
    { id: 'bun', level: 3, spacerBlockSizePx: 480, tag: 'h3', text: 'Bun' },
    { id: 'amp-plugin', level: 2, spacerBlockSizePx: 480, tag: 'h2', text: 'Amp Plugin' },
    {
      id: 'pi-extension',
      level: 2,
      spacerBlockSizePx: 480,
      tag: 'h2',
      text: 'Pi Extension',
    },
    {
      id: 'authentication',
      level: 2,
      spacerBlockSizePx: 480,
      tag: 'h2',
      text: 'Authentication',
    },
  ] as const

  return {
    Component: function Component() {
      return (
        <>
          {sections.map((section) => (
            <React.Fragment key={section.id}>
              {React.createElement(section.tag, { id: section.id }, section.text)}
              <div style={{ blockSize: `${section.spacerBlockSizePx}px` }} />
            </React.Fragment>
          ))}
          <div style={{ blockSize: '960px' }} />
        </>
      )
    },
    description: undefined,
    headings: sections.map((section) => ({
      id: section.id,
      level: section.level,
      text: section.text,
    })),
    path: 'test',
    sourcePath: 'docs/getting_started/installation.mdx',
    title: 'Test',
  }
}

function renderDocContent(doc: Doc, pagination?: DocPagination) {
  document.body.innerHTML = ''
  document.documentElement.scrollTop = 0
  document.body.style.margin = '0'

  const container = document.createElement('div')
  document.body.appendChild(container)

  const root = createRoot(container)
  flushSync(() => {
    root.render(<DocContent doc={doc} {...(pagination ? { pagination } : {})} />)
  })

  const outline = container.querySelector('aside')
  if (!outline) throw new Error('Expected outline aside to render')

  cleanup = () => {
    document.documentElement.scrollTop = 0
    window.scrollTo({ top: 0 })
    unmountRoot(root)
    container.remove()
  }

  return { outline: page.elementLocator(outline) }
}

function unmountRoot(root: Root) {
  flushSync(() => {
    root.unmount()
  })
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}
