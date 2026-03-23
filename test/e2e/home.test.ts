import { expect } from '@playwright/test'
import { test } from '#test/playwright-utils.ts'

test('/ shows homepage when logged out', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'curl.md' })).toBeVisible()
  expect(page.url()).not.toContain('/home')
})

test('/ redirects to dashboard when logged in', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)
  await page.goto('/')
  await page.waitForURL(`/${account.login}`)
})

test('/home shows homepage when logged in', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'curl.md' })).toBeVisible()
  expect(page.url()).toContain('/home')
})

test('/home redirects to / when logged out', async ({ page }) => {
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'curl.md' })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/')
})
