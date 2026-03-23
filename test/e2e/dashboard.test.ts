import { expect } from '@playwright/test'
import { test } from '#test/playwright-utils.ts'

test.describe('dashboard navigation', () => {
  let login: string

  test.beforeEach(async ({ factory, page, setSession }) => {
    const account = await factory.account.insert({})
    login = account.login
    await setSession(account.id)
    await page.goto(`/${login}`)
  })

  test('overview is the default page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  })

  test('navigate to requests', async ({ page }) => {
    await page.getByRole('link', { name: 'Requests' }).click()
    await page.waitForURL(`/${login}/requests`)
    await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible()
  })

  test('navigate to general settings', async ({ page }) => {
    await page.getByRole('link', { name: 'General' }).click()
    await page.waitForURL(`/${login}/settings/general`)
    await expect(page.getByRole('heading', { name: 'General' })).toBeVisible()
  })

  test('navigate to members settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Members' }).click()
    await page.waitForURL(`/${login}/settings/members`)
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible()
  })

  test('navigate to billing settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Billing' }).click()
    await page.waitForURL(`/${login}/settings/billing`)
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible()
  })

  test('navigate to tokens settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Tokens' }).click()
    await page.waitForURL(`/${login}/settings/tokens`)
    await expect(page.getByRole('heading', { name: 'Tokens' })).toBeVisible()
  })

  test('navigate back to overview from settings', async ({ page }) => {
    await page.getByRole('link', { name: 'General' }).click()
    await page.waitForURL(`/${login}/settings/general`)
    await page.getByRole('link', { name: 'Overview' }).click()
    await page.waitForURL(`/${login}`)
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  })

  test('sidebar is visible on all pages', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Requests' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'General' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Members' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Billing' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tokens' })).toBeVisible()
  })

  test('direct URL navigation works', async ({ page }) => {
    await page.goto(`/${login}/requests`)
    await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible()

    await page.goto(`/${login}/settings/general`)
    await expect(page.getByRole('heading', { name: 'General' })).toBeVisible()

    await page.goto(`/${login}/settings/billing`)
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible()

    await page.goto(`/${login}/settings/members`)
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible()

    await page.goto(`/${login}/settings/tokens`)
    await expect(page.getByRole('heading', { name: 'Tokens' })).toBeVisible()
  })
})
