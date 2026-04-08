import { expect } from '@playwright/test'
import { test } from '#test/e2e-utils.ts'

test('/playground shows playground page', async ({ page }) => {
  await page.goto('/playground')
  await expect(page.getByRole('heading', { level: 1, name: 'Playground' })).toBeVisible()
  await expect(page.getByText('Try fetching any URL as Markdown')).toBeVisible()
})

test('/playground has url input and fetch button', async ({ page }) => {
  await page.goto('/playground')
  const urlInput = page.locator('#url')
  await expect(urlInput).toBeVisible()
  await expect(urlInput).toBeFocused()
  await expect(page.getByRole('button', { name: 'Fetch', exact: true })).toBeDisabled()
})

test('/playground fetch button enabled when url entered', async ({ page }) => {
  await page.goto('/playground')
  const urlInput = page.locator('#url')
  await expect(urlInput).toBeFocused()
  await urlInput.fill('example.com')
  await expect(urlInput).toHaveValue('example.com')
  await expect(page.getByRole('button', { name: 'Fetch', exact: true })).toBeEnabled()
})

test('/playground fetches url and renders result', async ({ page }) => {
  await page.goto('/playground')
  const urlInput = page.locator('#url')
  await expect(urlInput).toBeFocused()
  await urlInput.fill('example.com')
  const fetchButton = page.getByRole('button', { name: 'Fetch', exact: true })
  await expect(fetchButton).toBeEnabled()
  await fetchButton.click()
  await expect(page.getByText('tokens saved')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible()
})

test('/playground pre-fills from search params', async ({ page }) => {
  await page.goto('/playground?url=example.com&q=test&k=foo')
  await expect(page.locator('#url')).toHaveValue('example.com')
  await expect(page.locator('#objective')).toHaveValue('test')
  await expect(page.locator('#keywords')).toHaveValue('foo')
})
