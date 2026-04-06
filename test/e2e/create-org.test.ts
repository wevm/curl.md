import { expect } from '@playwright/test'
import { test } from '#test/e2e-utils.ts'

test('creates organization from account switcher', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)
  await page.goto(`/${account.login}`, { waitUntil: 'networkidle' })

  // Open account switcher dropdown
  await page.getByRole('button', { name: account.name! }).click()
  await page.getByRole('menuitem', { name: 'Create Organization' }).click()

  // Dialog opens
  await expect(page.getByRole('heading', { name: 'Create Organization' })).toBeVisible()

  // Fill in form and submit
  await page.getByLabel('Login').fill('my-new-org')
  await page.getByLabel('Name').fill('My New Org')
  await page.getByRole('button', { name: 'Create' }).click()

  // Navigates to new org dashboard
  await page.waitForURL('/my-new-org')
  await expect(page.getByText('Tokens Saved')).toBeVisible()
})

test('shows error when org login is taken', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  const existing = await factory.organization.insert({ login: 'taken-org' })
  await setSession(account.id)
  await page.goto(`/${account.login}`, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: account.name! }).click()
  await page.getByRole('menuitem', { name: 'Create Organization' }).click()

  await page.getByLabel('Login').fill(existing.login)
  await page.getByRole('button', { name: 'Create' }).click()

  await expect(page.getByText('Login is already taken')).toBeVisible({ timeout: 10_000 })
})

test('closes dialog on cancel', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)
  await page.goto(`/${account.login}`, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: account.name! }).click()
  await page.getByRole('menuitem', { name: 'Create Organization' }).click()

  await expect(page.getByRole('heading', { name: 'Create Organization' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect(page.getByRole('heading', { name: 'Create Organization' })).not.toBeVisible()
})
