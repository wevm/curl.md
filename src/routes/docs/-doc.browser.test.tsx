import * as React from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { DocContent } from './-doc.tsx'
import type { Doc, DocPagination } from './-doc.types.ts'

let cleanup: (() => void) | undefined
const originalClipboard = navigator.clipboard

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  window.history.replaceState(null, '', '/')
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: originalClipboard,
  })
})

test('outline has no active heading on initial load without a hash', async () => {
  const rendered = renderDocContent(createDoc())

  await expect
    .element(rendered.outline.getByRole('link', { exact: true, name: 'CLI' }))
    .not.toHaveAttribute('data-active')
})

test('outline does not jump to the last heading when scrolling quickly to the middle', async () => {
  const rendered = renderDocContent(createDoc())
  const bunHeading = document.getElementById('bun')
  if (!bunHeading) throw new Error('Expected bun heading to exist')

  window.scrollTo({ top: bunHeading.offsetTop - 80 })

  await expect
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Bun' }))
    .toHaveAttribute('data-active')
  await expect
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Authentication' }))
    .not.toHaveAttribute('data-active')
})

test('outline does not force the last heading active near the bottom when more content follows', async () => {
  const rendered = renderDocContent(createDoc())
  const piExtensionHeading = document.getElementById('pi-extension')
  if (!piExtensionHeading) throw new Error('Expected pi extension heading to exist')

  window.scrollTo({ top: piExtensionHeading.offsetTop - 80 })

  await expect
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Pi Extension' }))
    .toHaveAttribute('data-active')
  await expect
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Authentication' }))
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
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Authentication' }))
    .toHaveAttribute('data-active')

  window.scrollTo({ top: piExtensionHeading.offsetTop - 80 })
  await waitForAnimationFrame()

  await expect
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Pi Extension' }))
    .toHaveAttribute('data-active')
  await expect
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Authentication' }))
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
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Blockquotes' }))
    .toHaveAttribute('data-active')
  await expect
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Lists' }))
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
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Blockquotes' }))
    .toHaveAttribute('data-active')

  window.scrollTo({ top: 0 })
  await waitForAnimationFrame()

  await expect
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Blockquotes' }))
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
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Blockquotes' }))
    .toHaveAttribute('data-active')

  await waitForTimeout(300)
  window.scrollTo({ top: Math.max(0, blockquotesHeading.offsetTop - 99) })
  await waitForAnimationFrame()

  await expect
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Lists' }))
    .toHaveAttribute('data-active')
  await expect
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Blockquotes' }))
    .not.toHaveAttribute('data-active')
})

test('mobile outline shows the current active heading', async () => {
  const rendered = renderDocContent(createDoc())
  const bunHeading = document.getElementById('bun')
  if (!bunHeading) throw new Error('Expected bun heading to exist')

  window.scrollTo({ top: bunHeading.offsetTop - 80 })
  await expect
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Bun' }))
    .toHaveAttribute('data-active')

  expect(
    rendered.container.querySelector('[data-mobile-doc-outline-current-heading]')?.textContent,
  ).toBe('Bun')
})

test('mobile outline shows Overview when no heading is active', () => {
  const rendered = renderDocContent(createDoc())

  expect(
    rendered.container.querySelector('[data-mobile-doc-outline-current-heading]')?.textContent,
  ).toBe('Overview')
})

test('mobile outline opens and closes after selecting a heading', async () => {
  const rendered = renderDocContent(createDoc())

  await rendered.content.getByRole('button', { exact: true, name: 'On this page' }).click()
  expect(document.querySelector('[data-doc-mobile-outline-panel]')).not.toBeNull()

  const mobileOutline = document.querySelector('[data-doc-mobile-outline-panel]')
  if (!mobileOutline) throw new Error('Expected mobile outline panel to render')

  await page
    .elementLocator(mobileOutline)
    .getByRole('menuitem', { exact: true, name: 'Bun' })
    .click()
  await waitForAnimationFrame()

  expect(document.querySelector('[data-doc-mobile-outline-panel]')).toBeNull()
  expect(window.location.hash).toBe('#bun')
})

test('mobile outline panel matches the sticky bar width', async () => {
  const rendered = renderDocContent(createDoc())

  await rendered.content.getByRole('button', { exact: true, name: 'On this page' }).click()
  await waitForAnimationFrame()

  const bar = document.querySelector('[data-mobile-doc-outline-bar]')
  const positioner = document.querySelector('[data-mobile-doc-outline-positioner]')
  const popup = document.querySelector('[data-doc-mobile-outline-panel]')
  if (!(bar instanceof HTMLElement)) throw new Error('Expected mobile outline bar to render')
  if (!(positioner instanceof HTMLElement))
    throw new Error('Expected mobile outline positioner to render')
  if (!(popup instanceof HTMLElement)) throw new Error('Expected mobile outline popup to render')

  const barRect = bar.getBoundingClientRect()
  const positionerRect = positioner.getBoundingClientRect()
  const popupRect = popup.getBoundingClientRect()

  expect(Math.abs(positionerRect.width - barRect.width)).toBeLessThan(2)
  expect(Math.abs(positionerRect.left - barRect.left)).toBeLessThan(2)
  expect(Math.abs(popupRect.width - barRect.width)).toBeLessThan(2)
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
  expect(firstCommandLine?.querySelector('.token.command')?.textContent).toBe('pnpm')
  expect(firstCommandLine?.querySelector('.token.command')).not.toBeNull()
  expect(rendered.container.querySelector('[aria-label="Copy command: pnpm check"]')).not.toBeNull()
  expect(
    rendered.container.querySelector('[aria-label="Copy command: pnpm check:types"]'),
  ).not.toBeNull()
})

test('shell prompt line copy strips the leading dollar prompt', async () => {
  const rendered = renderDocContent(createPromptShellDoc())
  let copied = ''

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        copied = value
      },
    },
  })

  await rendered.content
    .getByRole('button', { exact: true, name: 'Copy command: pnpm check' })
    .click()

  expect(copied).toBe('pnpm check')
})

test('copy page writes the doc markdown source to the clipboard', async () => {
  const rendered = renderDocContent(createCopyPageDoc())
  let copied = ''

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        copied = value
      },
    },
  })

  const mobileCopyButton = rendered.container.querySelector('[data-doc-mobile-copy-page]')
  if (!(mobileCopyButton instanceof HTMLButtonElement))
    throw new Error('Expected mobile copy page button to render')

  await page.elementLocator(mobileCopyButton).click()

  expect(copied).toBe(`# Installation

Install curl.md in the environment you use most.`)
})

test('copy page button moves into the page heading when the outline uses the sticky bar', () => {
  const rendered = renderDocContent(createCopyPageDoc())
  const pageHeading = rendered.container.querySelector('h1')
  const mobileCopyButton = rendered.container.querySelector('[data-doc-mobile-copy-page]')

  expect(pageHeading?.querySelector('[data-doc-mobile-copy-page]')).toBe(mobileCopyButton)
  expect(mobileCopyButton?.className).toContain('lg:hidden')
})

test('code blocks preserve inline syntax highlighter backgrounds', async () => {
  const rendered = renderDocContent(createStyledCodeBlockDoc())
  const pre = rendered.container.querySelector('[data-docs-code-block] pre')

  expect(pre?.getAttribute('style')).toContain('background-color: rgb(0, 0, 0);')
})

test('titled code blocks render a codegroup-style title bar with an icon', async () => {
  const rendered = renderDocContent(createTitledCodeBlockDoc())
  const title = rendered.container.querySelector('[data-docs-code-title]')
  const pre = rendered.container.querySelector('[data-docs-code-block] pre')
  const button = rendered.container.querySelector('[aria-label="Copy code"]')

  expect(title?.textContent).toContain('config.ts')
  expect(title?.querySelector('svg')).not.toBeNull()
  expect(pre?.className).toContain('border-t-0')
  expect(button?.className).not.toContain('opacity-0')
  expect(button?.className).toContain('top-[1.375rem]')
})

test('untitled code blocks keep the copy button hover-only', async () => {
  const rendered = renderDocContent(createStyledCodeBlockDoc())
  const button = rendered.container.querySelector('[aria-label="Copy code"]')

  expect(button?.className).toContain('opacity-0')
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

test('code groups sync matching labels through the query param', async () => {
  window.history.replaceState(null, '', '/docs/test?codegroup=pnpm')
  const rendered = renderDocContent(createSyncedCodeGroupDoc())
  await waitForAnimationFrame()
  const groups = rendered.container.querySelectorAll('[data-docs-code-group]')
  const [firstGroup, secondGroup] = groups
  if (!firstGroup || !secondGroup) throw new Error('Expected two code groups to render')

  expect(getActiveCodeGroupTabLabel(firstGroup)).toBe('pnpm')
  expect(getActiveCodeGroupTabLabel(secondGroup)).toBe('pnpm')

  await page.elementLocator(firstGroup).getByRole('tab', { exact: true, name: 'npm' }).click()

  expect(getActiveCodeGroupTabLabel(firstGroup)).toBe('npm')
  expect(getActiveCodeGroupTabLabel(secondGroup)).toBe('npm')
  expect(new URLSearchParams(window.location.search).get('codegroup')).toBe('npm')
})

test('synced code groups keep focus on the interacted tab', async () => {
  window.history.replaceState(null, '', '/docs/test?codegroup=pnpm')
  const rendered = renderDocContent(createSyncedCodeGroupDoc())
  await waitForAnimationFrame()
  const groups = rendered.container.querySelectorAll('[data-docs-code-group]')
  const [firstGroup, secondGroup] = groups
  if (!firstGroup || !secondGroup) throw new Error('Expected two code groups to render')

  const firstGroupNpmTab = Array.from(firstGroup.querySelectorAll('[role="tab"]')).find(
    (tab) => tab.textContent?.trim() === 'npm',
  )
  if (!(firstGroupNpmTab instanceof HTMLElement)) throw new Error('Expected npm tab to render')

  await page.elementLocator(firstGroup).getByRole('tab', { exact: true, name: 'npm' }).click()
  await waitForAnimationFrame()

  expect(document.activeElement).toBe(firstGroupNpmTab)
  expect(getActiveCodeGroupTabLabel(secondGroup)).toBe('npm')
  expect(secondGroup.contains(document.activeElement)).toBe(false)
})

test('code groups delegate url sync through the provided handler', async () => {
  const onCodeGroupValueChange = vi.fn()
  const rendered = renderDocContent(createSyncedCodeGroupDoc(), undefined, {
    onCodeGroupValueChange,
  })
  const groups = rendered.container.querySelectorAll('[data-docs-code-group]')
  const [firstGroup, secondGroup] = groups
  if (!firstGroup || !secondGroup) throw new Error('Expected two code groups to render')

  await page.elementLocator(secondGroup).getByRole('tab', { exact: true, name: 'pnpm' }).click()

  expect(onCodeGroupValueChange).toHaveBeenCalledWith('pnpm')
  expect(getActiveCodeGroupTabLabel(firstGroup)).toBe('pnpm')
  expect(getActiveCodeGroupTabLabel(secondGroup)).toBe('pnpm')
  expect(window.location.search).toBe('')
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

test('tables render inside a horizontal overflow container', async () => {
  const rendered = renderDocContent(createTableDoc())
  const tableContainer = rendered.container.querySelector('[data-docs-table]')
  const table = tableContainer?.querySelector('table')
  const headerCell = table?.querySelector('th')
  const bodyCell = table?.querySelector('td')

  expect(tableContainer).not.toBeNull()
  expect(table).not.toBeNull()
  expect(tableContainer?.className).toContain('overflow-x-auto')
  expect(tableContainer?.className).toContain('minimal-scrollbar')
  expect(table?.className).toContain('min-w-full')
  expect(headerCell?.className).toContain('whitespace-nowrap')
  expect(bodyCell?.className).toContain('whitespace-nowrap')
})

test('inline shiki code keeps the inner code element unstyled', async () => {
  const rendered = renderDocContent(createInlineShikiCodeDoc())
  const inlineCode = rendered.container.querySelector('[data-shiki-inline-code].shiki')
  const innerCode = inlineCode?.querySelector('code')

  expect(inlineCode).not.toBeNull()
  expect(innerCode?.className).toContain('bg-transparent')
  expect(innerCode?.className).not.toContain('bg-gray-a2')
})

test('last updated renders in the browser locale without the word at', async () => {
  const rendered = renderDocContent(createFooterDoc())

  await waitForAnimationFrame()
  await waitForTimeout(10)

  const text = rendered.container.textContent ?? ''
  expect(text).toContain('Last updated:')
  expect(text).not.toContain(' at ')
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

function createSyncedCodeGroupDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const CodeGroup = components.CodeGroup as React.ComponentType<React.PropsWithChildren>
      const CodeGroupItem = components.CodeGroupItem as React.ComponentType<
        React.PropsWithChildren<{ label?: string }>
      >

      return (
        <>
          <CodeGroup>
            <CodeGroupItem label="npm">
              <pre>
                <code className="language-sh">npm run dev</code>
              </pre>
            </CodeGroupItem>
            <CodeGroupItem label="pnpm">
              <pre>
                <code className="language-sh">pnpm dev</code>
              </pre>
            </CodeGroupItem>
            <CodeGroupItem label="bun">
              <pre>
                <code className="language-sh">bun run dev</code>
              </pre>
            </CodeGroupItem>
          </CodeGroup>

          <CodeGroup>
            <CodeGroupItem label="npm">
              <pre>
                <code className="language-sh">npm install</code>
              </pre>
            </CodeGroupItem>
            <CodeGroupItem label="pnpm">
              <pre>
                <code className="language-sh">pnpm install</code>
              </pre>
            </CodeGroupItem>
            <CodeGroupItem label="bun">
              <pre>
                <code className="language-sh">bun install</code>
              </pre>
            </CodeGroupItem>
          </CodeGroup>
        </>
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
        { 'data-shell-prompt': '' },
        React.createElement(
          Code,
          { className: 'language-sh' },
          '\n',
          <span className="line" key="check">
            <span className="token command">pnpm</span>
            {' check'}
          </span>,
          '\n',
          <span className="line" key="check-types">
            <span className="token command">pnpm</span>
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

function createStyledCodeBlockDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const Pre = (components.pre ?? 'pre') as React.ElementType
      const Code = (components.code ?? 'code') as React.ElementType

      return (
        <Pre style={{ backgroundColor: '#000', color: '#fff' }}>
          <Code className="language-ts">const md = create()</Code>
        </Pre>
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

function createTitledCodeBlockDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const Pre = (components.pre ?? 'pre') as React.ElementType
      const Code = (components.code ?? 'code') as React.ElementType

      return (
        <Pre title="config.ts">
          <Code className="language-ts">{'export const config = {}'}</Code>
        </Pre>
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

function createCopyPageDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const H1 = (components.h1 ?? 'h1') as React.ElementType
      const H2 = (components.h2 ?? 'h2') as React.ElementType

      return (
        <>
          <H1>Installation</H1>
          <H2 id="installation">Installation</H2>
          <p>Install curl.md in the environment you use most.</p>
        </>
      )
    },
    description: undefined,
    headings: [{ id: 'installation', level: 2, text: 'Installation' }],
    path: 'test',
    source: `# Installation

Install curl.md in the environment you use most.`,
    sourcePath: 'docs/getting_started/installation.mdx',
    title: 'Installation',
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

function createTableDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const Table = (components.table ?? 'table') as React.ElementType
      const TableBody = (components.tbody ?? 'tbody') as React.ElementType
      const TableCell = (components.td ?? 'td') as React.ElementType
      const TableHead = (components.thead ?? 'thead') as React.ElementType
      const TableHeaderCell = (components.th ?? 'th') as React.ElementType
      const TableRow = (components.tr ?? 'tr') as React.ElementType

      return (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Runtime</TableHeaderCell>
              <TableHeaderCell>Command</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>Node.js</TableCell>
              <TableCell>pnpm add curl.md</TableCell>
            </TableRow>
          </TableBody>
        </Table>
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

function createInlineShikiCodeDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const Code = (components.code ?? 'code') as React.ElementType

      return (
        <p>
          Use{' '}
          <span
            className="shiki"
            data-shiki-inline-code=""
            style={
              {
                '--shiki-dark': '#e6edf3',
                '--shiki-light': '#1f2328',
              } as React.CSSProperties
            }
          >
            <Code data-shiki-inline-code="">
              <span className="line">
                <span>pnpm</span>
                {' add curl.md'}
              </span>
            </Code>
          </span>{' '}
          for the CLI.
        </p>
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

function createFooterDoc(): Doc {
  return {
    Component: function Component() {
      return <p>Footer test</p>
    },
    description: undefined,
    headings: [],
    lastUpdated: '2026-04-12T17:38:00.000Z',
    path: 'test',
    source: '# Test\n',
    sourcePath: 'docs/reference/kitchen_sink.mdx',
    title: 'Test',
  }
}

function renderDocContent(
  doc: Doc,
  pagination?: DocPagination,
  options?: { onCodeGroupValueChange?: ((value: string) => void) | undefined },
) {
  document.body.innerHTML = ''
  document.documentElement.scrollTop = 0
  document.body.style.margin = '0'

  const container = document.createElement('div')
  document.body.appendChild(container)

  const root = createRoot(container)
  flushSync(() => {
    root.render(
      <DocContent
        doc={doc}
        {...(options?.onCodeGroupValueChange
          ? { onCodeGroupValueChange: options.onCodeGroupValueChange }
          : {})}
        {...(pagination ? { pagination } : {})}
      />,
    )
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

function getActiveCodeGroupTabLabel(container: Element) {
  return container.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()
}
