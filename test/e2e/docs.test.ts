import { expect } from '@playwright/test'
import { test } from '#test/e2e-utils.ts'

test('/docs codegroup tab click keeps scroll position on first sync', async ({ page }) => {
  await page.goto('/docs/reference/kitchen_sink')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { level: 1, name: 'Kitchen Sink' })).toBeVisible()

  const codeGroups = page.locator('[data-docs-code-group]')
  await expect(codeGroups).toHaveCount(2)

  const firstGroup = codeGroups.nth(0)
  const secondGroup = codeGroups.nth(1)
  const secondGroupPnpmTab = secondGroup.getByRole('tab', { exact: true, name: 'pnpm' })

  await secondGroup.scrollIntoViewIfNeeded()

  const scrollYBeforeClick = await page
    .locator('html')
    .evaluate((element) => element.ownerDocument.defaultView?.scrollY ?? 0)
  expect(scrollYBeforeClick).toBeGreaterThan(0)

  await secondGroupPnpmTab.click()

  await expect(page).toHaveURL(/\?codegroup=pnpm$/)
  await expect(secondGroupPnpmTab).toHaveAttribute('aria-selected', 'true')
  await expect(firstGroup.getByRole('tab', { exact: true, name: 'pnpm' })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  const scrollYAfterClick = await page
    .locator('html')
    .evaluate((element) => element.ownerDocument.defaultView?.scrollY ?? 0)
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
