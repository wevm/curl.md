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
import { getDocHeadings } from '#lib/docs.ts'
import { DocContent, DocSearchPreview, getDocSearchPreviewAnchor } from './-render.tsx'
import { getDocSearchHighlightRanges, type Doc, type DocPagination } from './-utils.ts'

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

test('outline respects the configured max heading level', async () => {
  const rendered = renderDocContent(createOutlineMaxLevelDoc())
  const advancedFlagsHeading = document.getElementById('advanced-flags')
  if (!advancedFlagsHeading) throw new Error('Expected advanced flags heading to exist')

  expect(rendered.container.querySelector('aside a[href="#advanced-flags"]')).toBeNull()

  window.scrollTo({ top: advancedFlagsHeading.offsetTop - 80 })
  await waitForAnimationFrame()

  await expect
    .element(rendered.outline.getByRole('link', { exact: true, name: 'Usage' }))
    .toHaveAttribute('data-active')

  expect(
    rendered.container.querySelector('[data-mobile-doc-outline-current-heading]')?.textContent,
  ).toBe('Usage')
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
  const promptCopySpacers = rendered.container.querySelectorAll('[data-command-copy-spacer]')
  const [firstCopyButton, secondCopyButton] = Array.from(
    rendered.container.querySelectorAll('[data-copy-command]'),
  )
  const copyOverlay = rendered.container.querySelector('[data-prompt-copy-overlay]')
  const pre = rendered.container.querySelector('[data-docs-code-block] pre')

  expect(rendered.container.querySelector('[aria-label="Copy code"]')).toBeNull()
  expect(rendered.container.querySelectorAll('[data-copy-command]').length).toBe(2)
  expect(rendered.container.querySelectorAll('[data-command-prompt]').length).toBe(2)
  expect(promptCopySpacers).toHaveLength(2)
  expect(copyOverlay).not.toBeNull()
  expect(pre).not.toBeNull()
  expect(pre?.className).toContain('pe-16')
  expect(firstCopyButton?.getAttribute('data-active')).toBeNull()
  expect(secondCopyButton?.getAttribute('data-active')).toBeNull()
  expect(firstCopyButton?.className).toContain('p-1.5')
  expect(firstCopyButton?.className).not.toContain('-me-1')
  expect(firstPrompt?.textContent).toBe('$')
  expect(firstCommandLine?.textContent?.match(/\$/g)?.length ?? 0).toBe(1)
  expect(firstCommandLine?.querySelector('.token.command')?.textContent).toBe('pnpm')
  expect(firstCommandLine?.querySelector('.token.command')).not.toBeNull()
  expect(rendered.container.querySelector('[aria-label="Copy command: pnpm check"]')).not.toBeNull()
  expect(
    rendered.container.querySelector('[aria-label="Copy command: pnpm check:types"]'),
  ).not.toBeNull()

  if (!(firstCommandLine instanceof HTMLElement))
    throw new Error('Expected first command line to render')

  await page.elementLocator(firstCommandLine).hover()

  expect(firstCopyButton?.getAttribute('data-active')).toBe('')
  expect(secondCopyButton?.getAttribute('data-active')).toBeNull()
})

test('shell prompt line copy strips the leading shell prompt', async () => {
  const rendered = renderDocContent(createPromptShellDoc())
  const firstCommandLine = rendered.container.querySelector('.line')
  let copied = ''

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        copied = value
      },
    },
  })

  if (!(firstCommandLine instanceof HTMLElement))
    throw new Error('Expected first command line to render')

  await page.elementLocator(firstCommandLine).hover()

  await rendered.content
    .getByRole('button', { exact: true, name: 'Copy command: pnpm check' })
    .click()

  expect(copied).toBe('pnpm check')
})

test('shell prompt block copy strips authored prompt prefixes', async () => {
  const rendered = renderDocContent(createPrefixedPromptShellDoc())
  const firstCommandLine = rendered.container.querySelector('.line')
  let copied = ''

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        copied = value
      },
    },
  })

  if (!(firstCommandLine instanceof HTMLElement))
    throw new Error('Expected first command line to render')

  await page.elementLocator(firstCommandLine).hover()

  await rendered.content
    .getByRole('button', { exact: true, name: 'Copy command: pnpm check' })
    .click()

  expect(copied).toBe('pnpm check')
})

test('single-line shell prompt blocks render a single per-line copy button', async () => {
  const rendered = renderDocContent(createSingleLinePromptShellDoc())
  const firstCommandLine = rendered.container.querySelector('.line')
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
  expect(rendered.container.querySelectorAll('[data-copy-command]')).toHaveLength(1)
  expect(rendered.container.querySelector('[aria-label="Copy code"]')).toBeNull()

  if (!(firstCommandLine instanceof HTMLElement))
    throw new Error('Expected first command line to render')

  await page.elementLocator(firstCommandLine).hover()

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

  expect(mobileCopyButton.textContent).toContain('Copy page')

  await page.elementLocator(mobileCopyButton).click()

  expect(copied).toBe(`# Installation

Install curl.md in the environment you use most.`)
})

test('copy page button moves into the page heading when the outline uses the sticky bar', () => {
  const rendered = renderDocContent(createCopyPageDoc())
  const pageHeading = rendered.container.querySelector('h1')
  const mobileCopyButton = rendered.container.querySelector('[data-doc-mobile-copy-page]')

  if (!(pageHeading instanceof HTMLHeadingElement))
    throw new Error('Expected page heading to render')
  if (!(mobileCopyButton instanceof HTMLButtonElement))
    throw new Error('Expected mobile copy page button to render')

  expect(pageHeading.querySelector('[data-doc-mobile-copy-page]')).toBe(mobileCopyButton)
})

test('view as markdown opens the generated markdown page in a new tab', () => {
  const rendered = renderDocContent(createCopyPageDoc())
  const markdownLink = rendered.container.querySelector('a[href="/docs/test.md"]')

  if (!(markdownLink instanceof HTMLAnchorElement))
    throw new Error('Expected view as markdown link to render')

  expect(markdownLink.textContent).toContain('View markdown')
  expect(markdownLink.getAttribute('target')).toBe('_blank')
  expect(markdownLink.getAttribute('rel')).toBe('noopener noreferrer')
})

test('titled code blocks render a codegroup-style title bar with an icon', async () => {
  const rendered = renderDocContent(createTitledCodeBlockDoc())
  const title = rendered.container.querySelector('[data-docs-code-title]')
  const button = rendered.container.querySelector('[aria-label="Copy code"]')

  expect(title?.textContent).toContain('config.ts')
  expect(title?.querySelector('svg')).not.toBeNull()
  expect(button).not.toBeNull()
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

  expect(rendered.container.querySelector('[data-docs-code-title]')).toBeNull()
  expect(button?.className).toContain('opacity-0')
  expect(button?.className).toContain('top-3')
  expect(pre?.className).toContain('pe-12')
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

test('curl code group tabs render theme-aware curl.se icons', () => {
  const rendered = renderDocContent(createCurlCodeGroupDoc())
  const curlTab = rendered.container.querySelector('[role="tab"][aria-selected="true"]')
  if (!(curlTab instanceof HTMLElement)) throw new Error('Expected curl tab to render')

  const icons = curlTab.querySelectorAll('svg')

  expect(normalizeText(curlTab.textContent)).toBe('curl')
  expect(icons).toHaveLength(2)
  expect(icons[0]?.className.baseVal).toContain('dark:hidden')
  expect(icons[1]?.className.baseVal).toContain('dark:block')
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

test('cards render as a responsive grid of clickable items', async () => {
  const rendered = renderDocContent(createCardsDoc())
  const cards = rendered.container.querySelectorAll('[data-docs-card]')
  const cardsGrid = rendered.container.querySelector('[data-docs-cards]')

  expect(cardsGrid).not.toBeNull()
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

test('last updated renders a short timestamp first, then swaps to the browser timezone without year or timezone noise', async () => {
  const rendered = renderDocContent(createFooterDoc())
  const initialText = rendered.container.textContent ?? ''
  const expectedUtcTimestamp = formatLastUpdatedForTest('2026-04-12T17:38:00.000Z', {
    locale: 'en-US',
    timeZone: 'UTC',
  })
  const expectedLocalTimestamp = formatLastUpdatedForTest('2026-04-12T17:38:00.000Z')

  expect(initialText).toContain('Last updated: ')
  expect(
    initialText.includes(`Last updated: ${expectedUtcTimestamp}`) ||
      initialText.includes(`Last updated: ${expectedLocalTimestamp}`),
  ).toBe(true)

  await waitForAnimationFrame()
  await waitForTimeout(10)

  const text = rendered.container.textContent ?? ''
  expect(text).toContain(`Last updated: ${expectedLocalTimestamp}`)
  expect(text).not.toContain('Apr 12, ')
  expect(text).not.toContain(' at ')
  expect(text).not.toContain(' UTC')
})

test('search preview headings keep the docs heading structure while swapping links for preview anchors', () => {
  const doc = createDocFromPreview(createSearchPreviewDoc())
  const full = captureDocContent(doc, (container) => {
    const heading = getRequiredHTMLElement(
      container,
      '#code-blocks',
      'Expected docs section heading to render',
    )
    const anchor = heading.querySelector('[href="#code-blocks"]')
    if (!(anchor instanceof HTMLAnchorElement))
      throw new Error('Expected docs section anchor link to render')

    return {
      anchorHref: anchor.getAttribute('href'),
      tagName: heading.tagName,
      text: normalizeText(heading.textContent).replace(/^#\s*/, ''),
    }
  })
  const preview = captureDocSearchPreview(
    doc,
    (container) => {
      const heading = getRequiredHTMLElement(
        container,
        '[data-doc-search-anchor="code-blocks"]',
        'Expected preview section heading to render',
      )

      return {
        anchorId: heading.getAttribute('data-doc-search-anchor'),
        hasSectionAnchorLink: heading.querySelector('[href="#code-blocks"]') !== null,
        tagName: heading.tagName,
        text: normalizeText(heading.textContent),
      }
    },
    { hash: 'code-blocks' },
  )

  expect(full.tagName).toBe('H2')
  expect(preview.tagName).toBe(full.tagName)
  expect(preview.text).toBe(full.text)
  expect(full.anchorHref).toBe('#code-blocks')
  expect(preview.anchorId).toBe('code-blocks')
  expect(preview.hasSectionAnchorLink).toBe(false)
})

test('search preview steps keep shared timeline content while swapping anchors', () => {
  const full = captureDocContent(createStepsDoc(), (container) => {
    const firstStepHeading = getRequiredHTMLElement(
      container,
      '[data-docs-step] h3',
      'Expected docs step heading to render',
    )

    return {
      linkCount: container.querySelectorAll('[aria-label^="Link to step:"]').length,
      signatures: getDocsStepSignatures(container),
      stepHeadingId: firstStepHeading.id,
      stepHeadingTagName: firstStepHeading.tagName,
    }
  })
  const preview = captureDocSearchPreview(createStepsDoc(), (container) => {
    const firstStepHeading = getRequiredHTMLElement(
      container,
      '[data-docs-step] h3',
      'Expected preview step heading to render',
    )

    return {
      linkCount: container.querySelectorAll('[aria-label^="Link to step:"]').length,
      signatures: getDocsStepSignatures(container),
      stepAnchor: firstStepHeading.getAttribute('data-doc-search-anchor'),
      stepHeadingTagName: firstStepHeading.tagName,
    }
  })

  expect(full.signatures).toEqual(preview.signatures)
  expect(full.linkCount).toBe(2)
  expect(preview.linkCount).toBe(0)
  expect(full.stepHeadingTagName).toBe('H3')
  expect(preview.stepHeadingTagName).toBe(full.stepHeadingTagName)
  expect(preview.stepAnchor).toBe(full.stepHeadingId)
})

test('search preview cards keep their content while becoming non-interactive', () => {
  const full = captureDocContent(createCardsDoc(), (container) => {
    const card = getRequiredHTMLElement(
      container,
      '[data-docs-card]',
      'Expected docs card to render',
    )
    const body = getRequiredHTMLElement(
      card,
      '[data-docs-card-body]',
      'Expected docs card body to render',
    )
    const title = getRequiredHTMLElement(
      card,
      '[data-docs-card-title]',
      'Expected docs card title to render',
    )

    return {
      bodyText: normalizeText(body.textContent),
      tagName: card.tagName,
      titleText: normalizeText(title.textContent),
    }
  })
  const preview = captureDocSearchPreview(createCardsDoc(), (container) => {
    const content = getRequiredHTMLElement(
      container,
      '[data-doc-search-preview] > div',
      'Expected preview content to render',
    )
    const anchor = getDocSearchPreviewAnchor(content, undefined)
    const card = getRequiredHTMLElement(
      container,
      '[data-docs-card]',
      'Expected preview card to render',
    )
    const body = getRequiredHTMLElement(
      card,
      '[data-docs-card-body]',
      'Expected preview card body to render',
    )
    const title = getRequiredHTMLElement(
      card,
      '[data-docs-card-title]',
      'Expected preview card title to render',
    )

    return {
      anchorMatchesCard: anchor?.matches('[data-docs-card]') ?? false,
      bodyText: normalizeText(body.textContent),
      tagName: card.tagName,
      titleText: normalizeText(title.textContent),
    }
  })

  expect(full.tagName).toBe('A')
  expect(preview.tagName).toBe('DIV')
  expect(preview.anchorMatchesCard).toBe(true)
  expect(preview.titleText).toBe(full.titleText)
  expect(preview.bodyText).toBe(full.bodyText)
})

test('search preview code groups preserve labels but isolate interactivity', () => {
  const doc = createDocFromPreview(createCodeGroupSearchPreviewDoc())
  const full = captureDocContent(doc, (container) => {
    const codeGroup = getRequiredHTMLElement(
      container,
      '[data-docs-code-group]',
      'Expected docs code group to render',
    )

    return {
      activeTabText: normalizeText(
        codeGroup.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
      ),
      hasInteractiveTabs: codeGroup.querySelector('[role="tab"]') !== null,
      tabLabels: [...codeGroup.querySelectorAll('[role="tab"]')].map((tab) =>
        normalizeText(tab.textContent),
      ),
    }
  })
  const preview = captureDocSearchPreview(
    doc,
    (container) => {
      const codeGroup = getRequiredHTMLElement(
        container,
        '[data-docs-code-group]',
        'Expected preview code group to render',
      )
      const tabList = getRequiredHTMLElement(
        codeGroup,
        ':scope > div',
        'Expected preview code group tab list to render',
      )
      const tabs = [...tabList.querySelectorAll(':scope > span')]
      const activeTab = tabs.find((tab) => tab.getAttribute('data-active') === '')
      if (!(activeTab instanceof HTMLElement))
        throw new Error('Expected active preview code group tab to render')

      return {
        activeTabText: normalizeText(activeTab.textContent),
        hasInteractiveTabs: codeGroup.querySelector('[role="tab"]') !== null,
        tabLabels: tabs
          .filter((tab) => normalizeText(tab.textContent) !== '')
          .map((tab) => normalizeText(tab.textContent)),
        text: normalizeText(codeGroup.textContent),
      }
    },
    { hash: 'install', terms: ['pnpm'] },
  )

  expect(full.hasInteractiveTabs).toBe(true)
  expect(full.tabLabels).toEqual(['npm', 'pnpm', 'bun'])
  expect(preview.tabLabels).toEqual(full.tabLabels)
  expect(full.activeTabText).toBe('npm')
  expect(preview.activeTabText).toBe('pnpm')
  expect(preview.hasInteractiveTabs).toBe(false)
  expect(preview.text).toContain('pnpm dev')
  expect(preview.text).not.toContain('npm run dev')
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

  expect(anchor).not.toBeNull()
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
    { id: 'lists', level: 2, text: 'Lists' },
    { id: 'blockquotes', level: 2, text: 'Blockquotes' },
    { id: 'horizontal-rule', level: 2, text: 'Horizontal Rule' },
    { id: 'code-blocks', level: 2, text: 'Code Blocks' },
    { id: 'code-groups', level: 2, text: 'Code Groups' },
    { id: 'details', level: 2, text: 'Details' },
    { id: 'notices', level: 2, text: 'Notices' },
    { id: 'tables', level: 2, text: 'Tables' },
    { id: 'steps', level: 2, text: 'Steps' },
    { id: 'cards', level: 2, text: 'Cards' },
    { id: 'package-links', level: 2, text: 'Package Links' },
  ])

  expect(headings).toEqual([
    { id: 'headings', level: 2, text: 'Headings' },
    { id: 'level-3-heading', level: 3, text: 'Level 3 Heading' },
    { id: 'level-4-heading', level: 4, text: 'Level 4 Heading' },
    { id: 'paragraphs-and-links', level: 2, text: 'Paragraphs And Links' },
    { id: 'lists', level: 2, text: 'Lists' },
    { id: 'blockquotes', level: 2, text: 'Blockquotes' },
    { id: 'horizontal-rule', level: 2, text: 'Horizontal Rule' },
    { id: 'code-blocks', level: 2, text: 'Code Blocks' },
    { id: 'code-groups', level: 2, text: 'Code Groups' },
    { id: 'details', level: 2, text: 'Details' },
    { id: 'notices', level: 2, text: 'Notices' },
    { id: 'tables', level: 2, text: 'Tables' },
    { id: 'steps', level: 2, text: 'Steps' },
    { id: 'install-dependencies', level: 3, text: '1. Install dependencies' },
    { id: 'start-the-dev-server', level: 3, text: '2. Start the dev server' },
    { id: 'open-the-app', level: 3, text: '3. Open the app' },
    { id: 'cards', level: 2, text: 'Cards' },
    { id: 'package-links', level: 2, text: 'Package Links' },
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

function createCurlCodeGroupDoc(): Doc {
  return {
    Component: function Component(props) {
      const components = props.components ?? {}
      const CodeGroup = components.CodeGroup as React.ComponentType<React.PropsWithChildren>
      const CodeGroupItem = components.CodeGroupItem as React.ComponentType<
        React.PropsWithChildren<{ label?: string }>
      >

      return (
        <CodeGroup>
          <CodeGroupItem label="curl">
            <pre>
              <code className="language-sh">curl -fsSL https://curl.md/install.sh | bash</code>
            </pre>
          </CodeGroupItem>
          <CodeGroupItem label="npm">
            <pre>
              <code className="language-sh">npm i -g curl.md</code>
            </pre>
          </CodeGroupItem>
        </CodeGroup>
      )
    },
    description: undefined,
    headings: [],
    path: 'test',
    source: '# Test\n',
    sourcePath: 'docs/install.mdx',
    title: 'Test',
  }
}

function createOutlineMaxLevelDoc(): Doc {
  const sections = [
    { id: 'cli', level: 2, spacerBlockSizePx: 320, tag: 'h2', text: 'CLI' },
    { id: 'usage', level: 3, spacerBlockSizePx: 320, tag: 'h3', text: 'Usage' },
    {
      id: 'advanced-flags',
      level: 4,
      spacerBlockSizePx: 320,
      tag: 'h4',
      text: 'Advanced Flags',
    },
    { id: 'auth', level: 2, spacerBlockSizePx: 320, tag: 'h2', text: 'Auth' },
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
        </>
      )
    },
    description: undefined,
    headings: sections.map((section) => ({
      id: section.id,
      level: section.level,
      text: section.text,
    })),
    outlineMaxLevel: 3,
    path: 'test',
    source: '# Test',
    sourcePath: 'docs/guide/cli.mdx',
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

function createPrefixedPromptShellDoc(): Doc {
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
            $ <span className="token command">pnpm</span>
            {' check'}
          </span>,
          '\n',
          <span className="line" key="check-types">
            $ <span className="token command">pnpm</span>
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

function createCodeGroupSearchPreviewDoc(): Pick<Doc, 'Component' | 'path'> {
  return {
    Component: function Component(props: {
      components?: Record<string, React.ComponentType<any>>
    }) {
      const Code = (props.components?.code ?? 'code') as React.ElementType
      const CodeGroup = (props.components?.CodeGroup ?? React.Fragment) as React.ElementType
      const CodeGroupItem = (props.components?.CodeGroupItem ?? React.Fragment) as React.ElementType
      const H2 = (props.components?.h2 ?? 'h2') as React.ElementType
      const Pre = (props.components?.pre ?? 'pre') as React.ElementType

      return (
        <>
          <H2 id="install">Install</H2>

          <CodeGroup>
            <CodeGroupItem label="npm">
              <Pre>
                <Code className="language-sh">npm run dev</Code>
              </Pre>
            </CodeGroupItem>

            <CodeGroupItem label="pnpm">
              <Pre>
                <Code className="language-sh">pnpm dev</Code>
              </Pre>
            </CodeGroupItem>

            <CodeGroupItem label="bun">
              <Pre>
                <Code className="language-sh">bun run dev</Code>
              </Pre>
            </CodeGroupItem>
          </CodeGroup>
        </>
      )
    },
    path: 'dev/kitchen-sink',
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

function captureDocContent<T>(doc: Doc, capture: (container: HTMLElement) => T) {
  const rendered = renderDocContent(doc)

  try {
    return capture(rendered.container)
  } finally {
    cleanup?.()
    cleanup = undefined
  }
}

function captureDocSearchPreview<T>(
  doc: Pick<Doc, 'Component' | 'path'>,
  capture: (container: HTMLElement) => T,
  options?: { hash?: string; terms?: Array<string> },
) {
  const rendered = renderDocSearchPreview(doc, options?.hash, options?.terms)

  try {
    return capture(rendered.container)
  } finally {
    cleanup?.()
    cleanup = undefined
  }
}

function createDocFromPreview(doc: Pick<Doc, 'Component' | 'path'>): Doc {
  return {
    Component: doc.Component,
    description: undefined,
    headings: [],
    path: doc.path,
    source: '# Test\n',
    sourcePath: 'docs/dev/kitchen-sink.mdx',
    title: 'Test',
  }
}

function getRequiredHTMLElement(
  container: Pick<Element, 'querySelector'>,
  selector: string,
  message: string,
) {
  const element = container.querySelector(selector)
  if (!(element instanceof HTMLElement)) throw new Error(message)

  return element
}

function getDocsStepSignatures(container: Pick<Element, 'querySelectorAll'>) {
  return [...container.querySelectorAll('[data-docs-step]')].map((step) => {
    const columns = step.querySelectorAll(':scope > div')
    const contentColumn = columns[1]

    return {
      bodyText: normalizeText(contentColumn?.querySelector('div')?.textContent),
      hasCodeBlock: step.querySelector('[data-docs-code-block]') !== null,
      title: normalizeText(contentColumn?.querySelector('h3')?.textContent),
    }
  })
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

function normalizeText(text: string | null | undefined) {
  return text?.replace(/\s+/g, ' ').trim() ?? ''
}
