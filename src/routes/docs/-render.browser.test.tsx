import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import * as React from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import kitchenSinkDocSource from '#docs/dev/kitchen-sink.mdx?raw'
import { DocContent, DocSearchPreview, getDocSearchPreviewAnchor } from './-render.tsx'
import {
  getDocHeadings,
  getDocSearchHighlightRanges,
  type Doc,
  type DocPagination,
} from './-utils.ts'

let cleanup: (() => void) | undefined
const originalClipboard = navigator.clipboard
const testRootRoute = createRootRoute({ component: () => null })
const testHomeRoute = createRoute({
  component: () => null,
  getParentRoute: () => testRootRoute,
  path: '/',
})
const testDocRoute = createRoute({
  component: () => null,
  getParentRoute: () => testRootRoute,
  path: '/docs/$slug',
})
const testRouteTree = testRootRoute.addChildren([testHomeRoute, testDocRoute])

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

test('mobile outline panel stays positioned within the sticky bar region', async () => {
  const rendered = renderDocContent(createDoc())

  await rendered.content.getByRole('button', { exact: true, name: 'On this page' }).click()
  await waitForAnimationFrame()

  const bar = document.querySelector('[data-mobile-doc-outline-bar]')
  const trigger = document.querySelector('[data-mobile-doc-outline-trigger]')
  const positioner = document.querySelector('[data-mobile-doc-outline-positioner]')
  const popup = document.querySelector('[data-doc-mobile-outline-panel]')
  if (!(bar instanceof HTMLElement)) throw new Error('Expected mobile outline bar to render')
  if (!(trigger instanceof HTMLElement))
    throw new Error('Expected mobile outline trigger to render')
  if (!(positioner instanceof HTMLElement))
    throw new Error('Expected mobile outline positioner to render')
  if (!(popup instanceof HTMLElement)) throw new Error('Expected mobile outline popup to render')

  const barRect = bar.getBoundingClientRect()
  const triggerRect = trigger.getBoundingClientRect()
  const positionerRect = positioner.getBoundingClientRect()
  const popupRect = popup.getBoundingClientRect()

  expect(positionerRect.width).toBeGreaterThan(100)
  expect(positionerRect.width).toBeLessThanOrEqual(window.innerWidth)
  expect(positionerRect.left).toBeGreaterThanOrEqual(barRect.left)
  expect(positionerRect.left).toBeLessThan(barRect.right)
  expect(positionerRect.top - triggerRect.bottom).toBeLessThan(12)
  expect(Math.abs(popupRect.width - positionerRect.width)).toBeLessThan(2)
})

test('shell prompt blocks render a copy button for each command line', async () => {
  const rendered = renderDocContent(createPromptShellDoc())
  const firstCommandLine = rendered.container.querySelector('.line')
  const firstPrompt = rendered.container.querySelector('[data-command-prompt]')

  expect(rendered.container.querySelector('[aria-label="Copy code"]')).toBeNull()
  expect(rendered.container.querySelectorAll('[data-copy-command]').length).toBe(2)
  expect(rendered.container.querySelectorAll('[data-command-prompt]').length).toBe(2)
  expect(rendered.container.querySelector('[data-command-prompt]')?.className).toContain(
    'select-none',
  )
  expect(firstPrompt?.textContent).toBe('$')
  expect(firstCommandLine?.textContent?.match(/\$/g)?.length ?? 0).toBe(1)
  expect(firstCommandLine?.querySelector('.token.command')?.textContent).toBe('pnpm')
  expect(firstCommandLine?.querySelector('.token.command')).not.toBeNull()
  expect(rendered.container.querySelector('[aria-label="Copy command: pnpm check"]')).not.toBeNull()
  expect(
    rendered.container.querySelector('[aria-label="Copy command: pnpm check:types"]'),
  ).not.toBeNull()
})

test('shell prompt line copy strips the leading shell prompt', async () => {
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

test('single-line shell prompt blocks keep the normal copy code button', async () => {
  const rendered = renderDocContent(createSingleLinePromptShellDoc())
  let copied = ''

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        copied = value
      },
    },
  })

  expect(rendered.container.querySelectorAll('[data-command-prompt]').length).toBe(1)
  expect(rendered.container.querySelector('[data-copy-command]')).toBeNull()
  expect(rendered.container.querySelector('[aria-label="Copy code"]')).not.toBeNull()

  await rendered.content.getByRole('button', { exact: true, name: 'Copy code' }).click()

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

test('json code blocks titled opencode.json and opencode.jsonc use the opencode icon', async () => {
  const rendered = renderDocContent(createOpencodeJsonCodeBlockDoc())
  const titles = Array.from(rendered.container.querySelectorAll('[data-docs-code-title]'))
  const opencodeTitle = titles.find((title) => title.textContent?.includes('opencode.json'))
  const opencodeJsoncTitle = titles.find((title) => title.textContent?.includes('opencode.jsonc'))
  const jsonTitle = titles.find((title) => title.textContent?.includes('config.json'))
  const docsCardIcon = rendered.container.querySelector('[data-docs-card-icon] svg')
  const opencodeIcon = opencodeTitle?.querySelector('svg')
  const opencodeJsoncIcon = opencodeJsoncTitle?.querySelector('svg')
  const jsonIcon = jsonTitle?.querySelector('svg')

  expect(opencodeIcon).not.toBeNull()
  expect(opencodeIcon?.innerHTML).toBe(docsCardIcon?.innerHTML)
  expect(opencodeJsoncIcon).not.toBeNull()
  expect(opencodeJsoncIcon?.innerHTML).toBe(docsCardIcon?.innerHTML)
  expect(opencodeIcon?.innerHTML).not.toBe(jsonIcon?.innerHTML)
})

test('json code blocks titled ~/.pi/agent/settings.json use the pi icon', async () => {
  const rendered = renderDocContent(createPiJsonCodeBlockDoc())
  const titles = Array.from(rendered.container.querySelectorAll('[data-docs-code-title]'))
  const piTitle = titles.find((title) => title.textContent?.includes('~/.pi/agent/settings.json'))
  const jsonTitle = titles.find((title) => title.textContent?.includes('config.json'))
  const docsCardIcon = rendered.container.querySelector('[data-docs-card-icon] svg')
  const piIcon = piTitle?.querySelector('svg')
  const jsonIcon = jsonTitle?.querySelector('svg')

  expect(piIcon).not.toBeNull()
  expect(piIcon?.innerHTML).toBe(docsCardIcon?.innerHTML)
  expect(piIcon?.innerHTML).not.toBe(jsonIcon?.innerHTML)
})

test('untitled code blocks keep the copy button hover-only', async () => {
  const rendered = renderDocContent(createStyledCodeBlockDoc())
  const button = rendered.container.querySelector('[aria-label="Copy code"]')
  const pre = rendered.container.querySelector('[data-docs-code-block] pre')

  expect(button?.className).toContain('opacity-0')
  expect(pre?.className).toContain('pe-14')
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
  window.history.replaceState(null, '', '/docs/dev/kitchen-sink?tab=pnpm')
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
  expect(new URLSearchParams(window.location.search).get('tab')).toBe('npm')
})

test('synced code groups keep focus on the interacted tab', async () => {
  window.history.replaceState(null, '', '/docs/dev/kitchen-sink?tab=pnpm')
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

test('code groups still read the legacy codegroup query param', async () => {
  window.history.replaceState(null, '', '/docs/dev/kitchen-sink?codegroup=pnpm')
  const rendered = renderDocContent(createSyncedCodeGroupDoc())
  await waitForAnimationFrame()
  const groups = rendered.container.querySelectorAll('[data-docs-code-group]')
  const [firstGroup, secondGroup] = groups
  if (!firstGroup || !secondGroup) throw new Error('Expected two code groups to render')

  expect(getActiveCodeGroupTabLabel(firstGroup)).toBe('pnpm')
  expect(getActiveCodeGroupTabLabel(secondGroup)).toBe('pnpm')
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

test('cards render as a responsive grid of clickable items', async () => {
  const rendered = renderDocContent(createCardsDoc())
  const cards = rendered.container.querySelectorAll('[data-docs-card]')
  const cardsGrid = rendered.container.querySelector('[data-docs-cards]')

  expect(cardsGrid).not.toBeNull()
  expect(cardsGrid?.className).toContain('grid-cols-1')
  expect(cardsGrid?.className).toContain('md:grid-cols-2')
  expect(cards).toHaveLength(2)
  expect(cards[0]?.getAttribute('href')).toBe('/docs/install')
  expect(cards[0]?.querySelector('[data-docs-card-icon]')).not.toBeNull()
  expect(cards[1]?.querySelector('[data-docs-card-icon]')).not.toBeNull()
  await expect.element(rendered.content.getByText('Install curl.md')).toBeVisible()
  await expect
    .element(rendered.content.getByText('Start with the CLI for terminal and script usage.'))
    .toBeVisible()
  await expect.element(rendered.content.getByText('Amp plugin')).toBeVisible()
})

test('plugin links render below the intro paragraph as top-level docs CTAs', async () => {
  const rendered = renderDocContent(createPluginLinksDoc())
  const buttonLinks = rendered.container.querySelectorAll('[data-docs-button-link]')
  const intro = rendered.content.getByText('Intro paragraph.')
  const buttonLinksContainer = rendered.container.querySelector('[data-docs-button-links]')
  const npmIcon = buttonLinks[0]?.querySelector('span > svg')?.parentElement

  expect(buttonLinksContainer).not.toBeNull()
  expect(buttonLinks).toHaveLength(2)
  expect(buttonLinks[0]?.className).toContain('h-9')
  expect(npmIcon?.className).toContain('text-[#cb3837]')
  expect(buttonLinksContainer?.compareDocumentPosition(intro.element())).toBe(
    Node.DOCUMENT_POSITION_PRECEDING,
  )
  await expect
    .element(rendered.content.getByRole('link', { exact: true, name: '@curl.md/amp' }))
    .toHaveAttribute('href', 'https://www.npmjs.com/package/@curl.md/amp')
  await expect
    .element(rendered.content.getByRole('link', { exact: true, name: 'Source code' }))
    .toHaveAttribute('href', 'https://github.com/wevm/curl.md/tree/main/plugins/amp')
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

test('last updated renders a short timestamp first, then swaps to the browser timezone without year or timezone noise', async () => {
  const rendered = renderDocContent(createFooterDoc())
  const initialText = rendered.container.textContent ?? ''

  expect(initialText).toContain(
    `Last updated: ${formatLastUpdatedForTest('2026-04-12T17:38:00.000Z', {
      locale: 'en-US',
      timeZone: 'UTC',
    })}`,
  )

  await waitForAnimationFrame()
  await waitForTimeout(10)

  const expectedLocalTimestamp = formatLastUpdatedForTest('2026-04-12T17:38:00.000Z')
  const text = rendered.container.textContent ?? ''
  expect(text).toContain(`Last updated: ${expectedLocalTimestamp}`)
  expect(text).not.toContain('Apr 12, ')
  expect(text).not.toContain(' at ')
  expect(text).not.toContain(' UTC')
})

test('search preview renders a real docs code block without copy controls', () => {
  const rendered = renderDocSearchPreview(createSearchPreviewDoc(), 'code-blocks')

  expect(rendered.container.querySelector('[data-doc-search-preview]')).not.toBeNull()
  expect(rendered.container.querySelector('[data-docs-code-block]')).not.toBeNull()
  expect(rendered.container.querySelector('[aria-label="Copy code"]')).toBeNull()
  expect(rendered.container.querySelector('[data-copy-command]')).toBeNull()
})

test('search preview renders the steps timeline as real docs markup', () => {
  const rendered = renderDocSearchPreview(createSearchPreviewDoc(), 'install-dependencies')

  expect(rendered.container.querySelector('[data-docs-steps]')).not.toBeNull()
  expect(
    rendered.container.querySelector('[data-doc-search-anchor="install-dependencies"]'),
  ).not.toBeNull()
  expect(rendered.container.querySelector('[href="#install-dependencies"]')).toBeNull()
})

test('search preview renders cards as non-interactive preview blocks', () => {
  const rendered = renderDocSearchPreview(createCardsSearchPreviewDoc(), 'install-paths')
  const content = rendered.container.querySelector('[data-doc-search-preview] > div')
  if (!(content instanceof HTMLElement)) throw new Error('Expected preview content to render')
  const anchor = getDocSearchPreviewAnchor(content, 'install-paths')
  const previewCard = rendered.container.querySelector('[data-docs-card]')

  expect(previewCard).not.toBeNull()
  expect(previewCard?.tagName).toBe('DIV')
  expect(anchor?.matches('[data-docs-card]')).toBe(true)
  expect(rendered.container.querySelector('a[data-docs-card]')).toBeNull()
  expect(rendered.container.querySelector('[data-docs-card-icon]')).not.toBeNull()
})

test('search preview scales notice typography down', () => {
  const rendered = renderDocSearchPreview(createNoticeSearchPreviewDoc(), 'notices')
  const notice = rendered.container.querySelector('[role="note"]')

  if (!(notice instanceof HTMLElement)) throw new Error('Expected preview notice to render')

  expect(notice.className).toContain('text-[0.8125rem]')
  expect(notice.className).not.toContain('text-[0.9375rem]')
})

test('search preview highlights matching heading and body text', () => {
  const rendered = renderDocSearchPreview(createSearchPreviewDoc(), 'install-dependencies', [
    'install',
    'pnpm',
  ])
  const content = rendered.container.querySelector('[data-doc-search-preview] > div')
  if (!(content instanceof HTMLElement)) throw new Error('Expected preview content to render')
  const anchor = getDocSearchPreviewAnchor(content, 'install-dependencies')

  const highlights = [...rendered.container.querySelectorAll('mark[data-doc-search-highlight]')]

  expect(anchor?.matches('[data-doc-search-anchor="install-dependencies"]')).toBe(true)
  expect(highlights.length).toBeGreaterThanOrEqual(2)
  expect(highlights.some((highlight) => highlight.textContent?.toLowerCase() === 'install')).toBe(
    true,
  )
  expect(highlights.some((highlight) => highlight.textContent?.toLowerCase() === 'pnpm')).toBe(true)
})

test('search highlight ranges merge matches separated only by whitespace', () => {
  expect(getDocSearchHighlightRanges('Level 3 Heading', ['level', '3'])).toEqual([
    { end: 7, start: 0 },
  ])
})

test('search highlight ranges merge matches separated by underscores', () => {
  expect(getDocSearchHighlightRanges('md_login', ['md', 'login'])).toEqual([{ end: 8, start: 0 }])
})

test('search highlight ranges keep non-whitespace-separated matches distinct', () => {
  expect(getDocSearchHighlightRanges('Level-3 Heading', ['level', '3'])).toEqual([
    { end: 5, start: 0 },
    { end: 7, start: 6 },
  ])
})

test('kitchen sink doc headings include numbered steps in outline order', () => {
  const headings = getDocHeadings(kitchenSinkDocSource, [
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
    { id: 'cards', level: 2, text: 'Cards' },
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
    { id: 'cards', level: 2, text: 'Cards' },
    { id: 'horizontal-rule', level: 2, text: 'Horizontal Rule' },
  ])
})

test('search preview scrolls section results to the first highlighted body match', () => {
  const rendered = renderDocSearchPreview(createNoticeSearchPreviewDoc(), 'notices', ['behavior'])
  const content = rendered.container.querySelector('[data-doc-search-preview] > div')
  if (!(content instanceof HTMLElement)) throw new Error('Expected preview content to render')
  const anchor = getDocSearchPreviewAnchor(content, 'notices')

  expect(anchor?.matches('[role="note"][data-type="important"]')).toBe(true)
  expect(content.querySelector('[role="note"][data-type="important"] mark')).not.toBeNull()
})

test('search preview skips repeated section headings when body content follows', () => {
  const rendered = renderDocSearchPreview(createSearchPreviewDoc(), 'code-blocks')
  const content = rendered.container.querySelector('[data-doc-search-preview] > div')
  if (!(content instanceof HTMLElement)) throw new Error('Expected preview content to render')
  const anchor = getDocSearchPreviewAnchor(content, 'code-blocks')

  expect(anchor?.matches('[data-docs-code-block]')).toBe(true)
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
    sourcePath: 'docs/getting-started/installation.mdx',
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
    sourcePath: 'docs/dev/kitchen-sink.mdx',
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
    sourcePath: 'docs/dev/kitchen-sink.mdx',
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
    sourcePath: 'docs/dev/develop.mdx',
    title: 'Test',
  }
}

function createSingleLinePromptShellDoc(): Doc {
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
        ),
      )
    },
    description: undefined,
    headings: [],
    path: 'test',
    source: '# Test\n',
    sourcePath: 'docs/dev/develop.mdx',
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
    sourcePath: 'docs/dev/kitchen-sink.mdx',
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
    sourcePath: 'docs/dev/kitchen-sink.mdx',
    title: 'Test',
  }
}

function createOpencodeJsonCodeBlockDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const Card = (components.Card ?? 'div') as React.ElementType
      const Pre = (components.pre ?? 'pre') as React.ElementType
      const Code = (components.code ?? 'code') as React.ElementType

      return (
        <>
          <Card href="/docs/plugins/opencode" icon="opencode" title="OpenCode">
            OpenCode card icon reference.
          </Card>
          <Pre title="opencode.json">
            <Code className="language-json">{'{"plugin": ["@curl.md/opencode"]}'}</Code>
          </Pre>
          <Pre title="opencode.jsonc">
            <Code className="language-jsonc">{'{"plugin": ["@curl.md/opencode"]}'}</Code>
          </Pre>
          <Pre title="config.json">
            <Code className="language-json">{'{"plugin": []}'}</Code>
          </Pre>
        </>
      )
    },
    description: undefined,
    headings: [],
    path: 'test',
    source: '# Test\n',
    sourcePath: 'docs/plugins/opencode.mdx',
    title: 'Test',
  }
}

function createPiJsonCodeBlockDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const Card = (components.Card ?? 'div') as React.ElementType
      const Pre = (components.pre ?? 'pre') as React.ElementType
      const Code = (components.code ?? 'code') as React.ElementType

      return (
        <>
          <Card href="/docs/plugins/pi" icon="pi" title="Pi">
            Pi card icon reference.
          </Card>
          <Pre title="~/.pi/agent/settings.json">
            <Code className="language-json">{'{"packages": ["npm:@curl.md/pi"]}'}</Code>
          </Pre>
          <Pre title="config.json">
            <Code className="language-json">{'{"packages": []}'}</Code>
          </Pre>
        </>
      )
    },
    description: undefined,
    headings: [],
    path: 'test',
    source: '# Test\n',
    sourcePath: 'docs/plugins/pi.mdx',
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
    sourcePath: 'docs/getting-started/installation.mdx',
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
    sourcePath: 'docs/dev/develop.mdx',
    title: 'Test',
  }
}

function createCardsDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const Card = components.Card as React.ComponentType<
        React.PropsWithChildren<{ href: string; icon?: string; title: string }>
      >
      const Cards = components.Cards as React.ComponentType<React.PropsWithChildren>

      return (
        <Cards>
          <Card href="/docs/install" icon="rocket" title="Install curl.md">
            <p>Start with the CLI for terminal and script usage.</p>
          </Card>
          <Card href="/docs/amp" icon="book" title="Amp plugin">
            <p>Enable docs fetch interception inside Amp.</p>
          </Card>
        </Cards>
      )
    },
    description: undefined,
    headings: [],
    path: 'test',
    source: '# Test\n',
    sourcePath: 'docs/dev/kitchen-sink.mdx',
    title: 'Test',
  }
}

function createPluginLinksDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const PluginLinks = components.PluginLinks as React.ComponentType<{
        npm: string
        source: string
      }>

      return (
        <>
          <h1>Amp</h1>
          <p>Intro paragraph.</p>
          <PluginLinks
            npm="@curl.md/amp"
            source="https://github.com/wevm/curl.md/tree/main/plugins/amp"
          />
        </>
      )
    },
    description: undefined,
    headings: [],
    path: 'test',
    source: '# Test\n',
    sourcePath: 'docs/plugins/amp.mdx',
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
    sourcePath: 'docs/dev/kitchen-sink.mdx',
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
    sourcePath: 'docs/dev/kitchen-sink.mdx',
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
    sourcePath: 'docs/dev/kitchen-sink.mdx',
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
    sourcePath: 'docs/dev/kitchen-sink.mdx',
    title: 'Test',
  }
}

function createSearchPreviewDoc(): Pick<Doc, 'Component' | 'path'> {
  return {
    Component: function Component(props: {
      components?: Record<string, React.ComponentType<any>>
    }) {
      const H2 = (props.components?.h2 ?? 'h2') as React.ElementType
      const P = (props.components?.p ?? 'p') as React.ElementType
      const Pre = (props.components?.pre ?? 'pre') as React.ElementType
      const Code = (props.components?.code ?? 'code') as React.ElementType
      const Step = (props.components?.Step ?? React.Fragment) as React.ElementType
      const Steps = (props.components?.Steps ?? React.Fragment) as React.ElementType

      return (
        <>
          <H2 id="code-blocks">Code Blocks</H2>
          <Pre>
            <Code className="language-sh">$ pnpm dev</Code>
          </Pre>

          <H2 id="steps">Steps</H2>
          <Steps>
            <Step title="Install dependencies">
              <P>Use your preferred package manager to install project dependencies.</P>
            </Step>

            <Step title="Start the dev server">
              <Pre>
                <Code className="language-sh">$ pnpm dev</Code>
              </Pre>
            </Step>
          </Steps>
        </>
      )
    },
    path: 'dev/kitchen-sink',
  }
}

function createNoticeSearchPreviewDoc(): Pick<Doc, 'Component' | 'path'> {
  return {
    Component: function Component(props: {
      components?: Record<string, React.ComponentType<any>>
    }) {
      const H2 = (props.components?.h2 ?? 'h2') as React.ElementType
      const Notice = (props.components?.Notice ?? React.Fragment) as React.ElementType
      const P = (props.components?.p ?? 'p') as React.ElementType

      return (
        <>
          <H2 id="notices">Notices</H2>

          <Notice>
            <P>Notices without a custom title default to the notice type.</P>
          </Notice>

          <Notice type="tip">
            <P>Use titled notices when the label should be more specific than the default.</P>
          </Notice>

          <Notice type="important">
            <P>Use important notices for behavior people should not miss.</P>
          </Notice>
        </>
      )
    },
    path: 'dev/kitchen-sink',
  }
}

function createCardsSearchPreviewDoc(): Pick<Doc, 'Component' | 'path'> {
  return {
    Component: function Component(props: {
      components?: Record<string, React.ComponentType<any>>
    }) {
      const Card = (props.components?.Card ?? React.Fragment) as React.ElementType
      const Cards = (props.components?.Cards ?? React.Fragment) as React.ElementType
      const H2 = (props.components?.h2 ?? 'h2') as React.ElementType

      return (
        <>
          <H2 id="install-paths">Install Paths</H2>

          <Cards>
            <Card href="/docs/install" icon="rocket" title="CLI">
              <p>Start from the terminal for the broadest support.</p>
            </Card>
            <Card href="/docs/amp" icon="book" title="Amp">
              <p>Use the plugin when you want `md_fetch` inside Amp.</p>
            </Card>
          </Cards>
        </>
      )
    },
    path: 'install',
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
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [window.location.pathname || '/'] }),
    routeTree: testRouteTree,
  })
  flushSync(() => {
    root.render(
      <RouterContextProvider router={router}>
        <DocContent
          doc={doc}
          {...(options?.onCodeGroupValueChange
            ? { onCodeGroupValueChange: options.onCodeGroupValueChange }
            : {})}
          {...(pagination ? { pagination } : {})}
        />
      </RouterContextProvider>,
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

function renderDocSearchPreview(
  doc: Pick<Doc, 'Component' | 'path'>,
  hash?: string,
  terms?: Array<string>,
) {
  document.body.innerHTML = ''
  document.documentElement.scrollTop = 0
  document.body.style.margin = '0'

  const container = document.createElement('div')
  document.body.appendChild(container)

  const root = createRoot(container)
  flushSync(() => {
    root.render(<DocSearchPreview doc={doc} hash={hash} terms={terms} />)
  })

  cleanup = () => {
    document.documentElement.scrollTop = 0
    window.scrollTo({ top: 0 })
    unmountRoot(root)
    container.remove()
  }

  return { container }
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

function formatLastUpdatedForTest(value: string, options?: { locale?: string; timeZone?: string }) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const yearFormatter = new Intl.DateTimeFormat(options?.locale, {
    ...(options?.timeZone ? { timeZone: options.timeZone } : {}),
    year: 'numeric',
  })
  const showYear =
    getDateTimePart(yearFormatter, date, 'year') !==
    getDateTimePart(yearFormatter, new Date(), 'year')

  return new Intl.DateTimeFormat(options?.locale, {
    day: 'numeric',
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
    month: 'short',
    ...(options?.timeZone ? { timeZone: options.timeZone } : {}),
    ...(showYear ? { year: 'numeric' } : {}),
  })
    .formatToParts(date)
    .map((part) =>
      part.type === 'literal'
        ? normalizeLastUpdatedLiteralForTest(part.value, showYear)
        : part.value,
    )
    .join('')
    .trim()
}

function normalizeLastUpdatedLiteralForTest(value: string, showYear: boolean) {
  const normalized = value.replace(' at ', ' ').replace(/\u202f/g, ' ')
  return showYear ? normalized : normalized.replace(/,\s*/g, ' ')
}

function getDateTimePart(
  formatter: Intl.DateTimeFormat,
  date: Date,
  type: Intl.DateTimeFormatPartTypes,
) {
  return formatter.formatToParts(date).find((part) => part.type === type)?.value
}

function getActiveCodeGroupTabLabel(container: Element) {
  return container.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()
}
