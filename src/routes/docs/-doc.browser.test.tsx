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

test('outline keeps the hash target active when the heading is still visible', async () => {
  const rendered = renderDocContent(createCompactDoc())
  const blockquotesHeading = document.getElementById('blockquotes')
  if (!blockquotesHeading) throw new Error('Expected blockquotes heading to exist')

  window.history.replaceState(null, '', '#blockquotes')
  window.scrollTo({ top: Math.max(0, blockquotesHeading.offsetTop - 100) })
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  await waitForAnimationFrame()

  await expect
    .element(rendered.outline.getByText('Blockquotes', { exact: true }))
    .toHaveAttribute('data-active')
  await expect
    .element(rendered.outline.getByText('Lists', { exact: true }))
    .not.toHaveAttribute('data-active')
})

test('outline clears the hash target after scrolling back to the top', async () => {
  const rendered = renderDocContent(createCompactDoc())
  const blockquotesHeading = document.getElementById('blockquotes')
  if (!blockquotesHeading) throw new Error('Expected blockquotes heading to exist')

  window.history.replaceState(null, '', '#blockquotes')
  window.scrollTo({ top: Math.max(0, blockquotesHeading.offsetTop - 80) })
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  await waitForAnimationFrame()

  await expect
    .element(rendered.outline.getByText('Blockquotes', { exact: true }))
    .toHaveAttribute('data-active')

  window.scrollTo({ top: 0 })
  await waitForAnimationFrame()

  await expect
    .element(rendered.outline.getByText('Blockquotes', { exact: true }))
    .not.toHaveAttribute('data-active')
})

test('outline stops honoring the hash once scrolling resumes', async () => {
  const rendered = renderDocContent(createCompactDoc())
  const blockquotesHeading = document.getElementById('blockquotes')
  if (!blockquotesHeading) throw new Error('Expected blockquotes heading to exist')

  window.history.replaceState(null, '', '#blockquotes')
  window.scrollTo({ top: Math.max(0, blockquotesHeading.offsetTop - 100) })
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  await waitForAnimationFrame()

  await expect
    .element(rendered.outline.getByText('Blockquotes', { exact: true }))
    .toHaveAttribute('data-active')

  await waitForTimeout(300)
  window.scrollTo({ top: Math.max(0, blockquotesHeading.offsetTop - 99) })
  await waitForAnimationFrame()

  await expect
    .element(rendered.outline.getByText('Lists', { exact: true }))
    .toHaveAttribute('data-active')
  await expect
    .element(rendered.outline.getByText('Blockquotes', { exact: true }))
    .not.toHaveAttribute('data-active')
})

test('shell prompt blocks render a copy button for each command line', async () => {
  const rendered = renderDocContent(createPromptShellDoc())
  const firstCommandLine = rendered.container.querySelector('.line')

  expect(rendered.container.querySelector('[aria-label="Copy code"]')).toBeNull()
  expect(rendered.container.querySelectorAll('[data-copy-command]').length).toBe(2)
  expect(rendered.container.querySelectorAll('[data-command-prompt]').length).toBe(2)
  expect(rendered.container.querySelector('[data-command-prompt]')?.className).toContain(
    'select-none',
  )
  expect(firstCommandLine?.textContent?.match(/\$/g)?.length ?? 0).toBe(1)
  expect(firstCommandLine?.querySelector('.token.command')).not.toBeNull()
  expect(rendered.container.querySelector('[aria-label="Copy command: pnpm check"]')).not.toBeNull()
  expect(
    rendered.container.querySelector('[aria-label="Copy command: pnpm check:types"]'),
  ).not.toBeNull()
})

test('code groups switch the visible panel when tabs are clicked', async () => {
  const rendered = renderDocContent(createCodeGroupDoc())

  await expect
    .element(rendered.content.getByRole('tab', { name: 'config.js' }))
    .toHaveAttribute('aria-selected', 'true')
  await expect.element(rendered.content.getByText("console.log('js')")).toBeVisible()

  await rendered.content.getByRole('tab', { name: 'config.ts' }).click()

  await expect
    .element(rendered.content.getByRole('tab', { name: 'config.ts' }))
    .toHaveAttribute('aria-selected', 'true')
  await expect.element(rendered.content.getByText("console.log('ts')")).toBeVisible()
})

test('steps render numbered timeline items', async () => {
  const rendered = renderDocContent(createStepsDoc())

  await expect.element(rendered.content.getByText('Install and start OrbStack')).toBeVisible()
  await expect.element(rendered.content.getByText('Copy the environment file')).toBeVisible()
  await expect
    .element(rendered.content.getByText('OrbStack provides local Docker support.'))
    .toBeVisible()
  await expect.element(rendered.content.getByText('cp .env.example .env')).toBeVisible()
  await expect
    .element(
      rendered.content.getByRole('link', { name: 'Link to step: Install and start OrbStack' }),
    )
    .toHaveAttribute('href', '#install-and-start-orbstack')
  expect(rendered.container.querySelector('#install-and-start-orbstack')).not.toBeNull()
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
    source: '# Test',
    sourcePath: 'docs/getting_started/installation.mdx',
    title: 'Test',
  }
}

function createCodeGroupDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const CodeGroup = components.CodeGroup as React.ComponentType<React.PropsWithChildren>
      const CodeGroupItem = components.CodeGroupItem as React.ComponentType<
        React.PropsWithChildren<{ label?: string }>
      >

      return (
        <CodeGroup>
          <CodeGroupItem label="config.js">
            <pre>
              <code className="language-js">console.log('js')</code>
            </pre>
          </CodeGroupItem>
          <CodeGroupItem label="config.ts">
            <pre>
              <code className="language-ts">console.log('ts')</code>
            </pre>
          </CodeGroupItem>
        </CodeGroup>
      )
    },
    description: undefined,
    headings: [],
    path: 'test',
    source: '# Test\n',
    sourcePath: 'docs/reference/kitchen_sink.mdx',
    title: 'Test',
  }
}

function createPromptShellDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const Pre = (components.pre ?? 'pre') as React.ElementType
      const Code = (components.code ?? 'code') as React.ElementType

      return React.createElement(
        Pre,
        undefined,
        React.createElement(
          Code,
          { className: 'language-sh' },
          '\n',
          <span className="line" key="check">
            <span className="token punctuation">$</span> <span className="token command">pnpm</span>
            {' check'}
          </span>,
          '\n',
          <span className="line" key="check-types">
            <span className="token punctuation">$</span> <span className="token command">pnpm</span>
            {' check:types'}
          </span>,
          '\n',
        ),
      )
    },
    description: undefined,
    headings: [],
    path: 'test',
    source: '# Test\n',
    sourcePath: 'docs/development/contributing.mdx',
    title: 'Test',
  }
}

function createStepsDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const Step = components.Step as React.ComponentType<
        React.PropsWithChildren<{ title?: string }>
      >
      const Steps = components.Steps as React.ComponentType<React.PropsWithChildren>

      return (
        <Steps>
          <Step title="Install and start OrbStack">
            <p>OrbStack provides local Docker support.</p>
          </Step>
          <Step title="Copy the environment file">
            <pre>
              <code className="language-sh">cp .env.example .env</code>
            </pre>
          </Step>
        </Steps>
      )
    },
    description: undefined,
    headings: [],
    path: 'test',
    source: '# Test\n',
    sourcePath: 'docs/development/contributing.mdx',
    title: 'Test',
  }
}

function createCompactDoc(): Doc {
  const sections = [
    { id: 'headings', text: 'Headings' },
    { id: 'paragraphs-and-links', text: 'Paragraphs And Links' },
    { id: 'notices', text: 'Notices' },
    { id: 'lists', text: 'Lists' },
    { id: 'blockquotes', text: 'Blockquotes' },
    { id: 'code-blocks', text: 'Code Blocks' },
  ] as const

  return {
    Component: function Component() {
      return (
        <>
          {sections.map((section) => (
            <React.Fragment key={section.id}>
              <h2 id={section.id}>{section.text}</h2>
              <div style={{ blockSize: '32px' }} />
            </React.Fragment>
          ))}
          <div style={{ blockSize: '480px' }} />
        </>
      )
    },
    description: undefined,
    headings: sections.map((section) => ({ id: section.id, level: 2, text: section.text })),
    path: 'test',
    source: '# Test',
    sourcePath: 'docs/reference/kitchen_sink.mdx',
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

  return {
    container,
    content: page.elementLocator(container),
    outline: page.elementLocator(outline),
  }
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

function waitForTimeout(timeoutMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), timeoutMs)
  })
}
