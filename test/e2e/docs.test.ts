import { expect } from '@playwright/test'
import { test } from '#test/e2e-utils.ts'

test('/docs tab click keeps scroll position on first sync', async ({ page }) => {
  await page.goto('/docs/reference/kitchen_sink')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { level: 1, name: 'Kitchen Sink' })).toBeVisible()

  const codeGroups = page.locator('[data-docs-code-group]')
  await expect(codeGroups).toHaveCount(2)

  const firstGroup = codeGroups.nth(0)
  const secondGroup = codeGroups.nth(1)
  const secondGroupPnpmTab = secondGroup.getByRole('tab', { exact: true, name: 'pnpm' })

  await secondGroup.scrollIntoViewIfNeeded()

  const scrollYBeforeClick = Number(await page.evaluate('window.scrollY'))
  expect(scrollYBeforeClick).toBeGreaterThan(0)

  await secondGroupPnpmTab.click()

  await expect(page).toHaveURL(/\?tab=pnpm$/)
  await expect(secondGroupPnpmTab).toHaveAttribute('aria-selected', 'true')
  await expect(firstGroup.getByRole('tab', { exact: true, name: 'pnpm' })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  const scrollYAfterClick = Number(await page.evaluate('window.scrollY'))
  expect(Math.abs(scrollYAfterClick - scrollYBeforeClick)).toBeLessThan(4)
})

test('/docs search query persists in q while typing and after refresh', async ({ page }) => {
  await page.goto('/docs/reference/kitchen_sink')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Search' }).click()

  const searchInput = page.getByPlaceholder('Search documentation')
  await expect(searchInput).toBeVisible()

  await searchInput.pressSequentially('k')
  await expect(searchInput).toHaveValue('k')
  await expect(page).toHaveURL(/\/docs\/reference\/kitchen_sink\?q=k$/)

  await searchInput.pressSequentially('i')
  await expect(searchInput).toHaveValue('ki')
  await expect(page).toHaveURL(/\/docs\/reference\/kitchen_sink\?q=ki$/)

  await page.reload()

  await expect(page).toHaveURL(/\/docs\/reference\/kitchen_sink\?q=ki$/)
  await expect(searchInput).toBeVisible()
  await expect(searchInput).toHaveValue('ki')
})

test('/docs search preview renders real code blocks and steps from compiled docs excerpts', async ({
  page,
}) => {
  await page.goto('/docs/reference/kitchen_sink')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Search' }).click()

  const searchInput = page.getByPlaceholder('Search documentation')
  await expect(searchInput).toBeVisible()
  const searchResults = page.getByRole('listbox')

  await page.getByRole('button', { name: 'Show body previews' }).click()
  await searchInput.pressSequentially('Code Blocks')

  const codeResultItem = searchResults
    .getByRole('option')
    .filter({ has: page.getByText('Code Blocks', { exact: true }) })
    .first()

  await expect(codeResultItem).toBeVisible()
  await expect(
    codeResultItem
      .locator('[data-doc-search-preview] [data-docs-code-block]')
      .filter({ hasText: 'curl.md https://example.com' }),
  ).toBeVisible()

  await searchInput.fill('')
  await searchInput.pressSequentially('Install dependencies')

  const stepsResultItem = searchResults
    .getByRole('option')
    .filter({ has: page.getByText('Install dependencies', { exact: true }) })
    .first()

  await expect(stepsResultItem).toBeVisible()
  await expect(stepsResultItem.locator('[data-doc-search-preview] [data-docs-steps]')).toBeVisible()
})

test('/docs search pressing Enter opens the highlighted result', async ({ page }) => {
  await page.goto('/docs')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Search' }).click()

  const searchInput = page.getByPlaceholder('Search documentation')
  await expect(searchInput).toBeVisible()

  await searchInput.pressSequentially('Kitchen Sink')
  await expect(page).toHaveURL(/\/docs\?q=Kitchen(?:\+|%20)Sink$/)

  await searchInput.press('Enter')

  await expect(page).toHaveURL('/docs/reference/kitchen_sink')
  await expect(page.getByRole('heading', { level: 1, name: 'Kitchen Sink' })).toBeVisible()
})

test('/docs recent search results do not highlight previous query terms', async ({ page }) => {
  await page.goto('/docs')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Search' }).click()

  const searchInput = page.getByPlaceholder('Search documentation')
  await expect(searchInput).toBeVisible()

  await searchInput.pressSequentially('Kitchen Sink')
  await expect(page).toHaveURL(/\/docs\?q=Kitchen(?:\+|%20)Sink$/)

  await searchInput.press('Enter')

  await expect(page).toHaveURL('/docs/reference/kitchen_sink')

  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByText('Recents', { exact: true })).toBeVisible()
  await expect(page.getByRole('listbox').getByRole('option').locator('mark')).toHaveCount(0)
})

test('/docs missing pages render a docs-specific 404 inside the docs layout', async ({ page }) => {
  await page.goto('/docs/does/not/exist')
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('button', { name: 'Search' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to docs' })).toHaveAttribute('href', '/docs')
  await expect(page.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')
})

test('/docs missing pages link signed-in viewers to /home', async ({
  factory,
  page,
  setSession,
}) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  await page.goto('/docs/does/not/exist')
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/home')
})
