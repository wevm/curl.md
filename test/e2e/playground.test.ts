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

test('/playground preserves target query strings and moves fragments into anchor', async ({
  page,
}) => {
  let requestUrl = ''
  await page.route(
    (url) => new URL(url).pathname.startsWith('/anchor-playground.example.com/'),
    async (route) => {
      requestUrl = route.request().url()
      await route.fulfill({
        body: JSON.stringify({ content: '# Example' }),
        contentType: 'application/json',
        headers: {
          'x-cache': 'MISS',
          'x-tokens-count': '10',
          'x-tokens-saved': '0',
        },
        status: 200,
      })
    },
  )

  await page.goto(
    '/playground?url=anchor-playground.example.com%2Fdocs%3Ftab%3Dapi&anchor=install&q=find%20install%20steps&k=api',
  )

  await expect(page.locator('#url')).toHaveValue(
    'anchor-playground.example.com/docs?tab=api#install',
  )
  await expect(page.locator('#objective')).toHaveValue('find install steps')
  await expect(page.locator('#keywords')).toHaveValue('api')

  await expect(
    page.getByText(
      'curl.local/anchor-playground.example.com/docs%3Ftab%3Dapi?anchor=install&k=api&q=find+install+steps',
    ),
  ).toBeVisible({ timeout: 30_000 })

  const url = new URL(requestUrl)
  expect(url.hash).toBe('')
  expect(url.pathname).toBe('/anchor-playground.example.com/docs%3Ftab%3Dapi')
  expect(url.searchParams.get('anchor')).toBe('install')
  expect(url.searchParams.get('k')).toBe('api')
  expect(url.searchParams.get('q')).toBe('find install steps')
})
