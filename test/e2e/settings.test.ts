import { expect } from '@playwright/test'
import { test } from '#test/e2e-utils.ts'

test('changes name', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)
  await page.goto(`/${account.login}/settings`, { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  const nameInput = page.getByLabel('Name')
  await nameInput.fill('New Name')
  await page.getByRole('button', { name: 'Update' }).click()

  await expect(page.getByText('Settings saved.')).toBeVisible()
})

test('changes login and completes confirmation dialog', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)
  await page.goto(`/${account.login}/settings`, { waitUntil: 'networkidle' })

  const loginInput = page.getByLabel('Login')
  await loginInput.fill('newlogin99')
  await page.getByRole('button', { name: 'Update' }).click()

  // Confirmation dialog appears
  await expect(page.getByRole('heading', { name: 'Change login' })).toBeVisible()
  await expect(page.getByText('Warning')).toBeVisible()

  // "Change login" button disabled until current login typed
  await expect(page.getByRole('button', { name: 'Change login' })).toBeDisabled()
  await page.getByPlaceholder(account.login).fill(account.login)
  await page.getByRole('button', { name: 'Change login' }).click()

  // Should navigate to new login URL
  await page.waitForURL('/newlogin99/settings')
})

test('shows error when login is already taken', async ({ factory, page, setSession }) => {
  const existing = await factory.account.insert({ login: 'takenlogin' })
  const account = await factory.account.insert({})
  await setSession(account.id)
  await page.goto(`/${account.login}/settings`, { waitUntil: 'networkidle' })

  const loginInput = page.getByLabel('Login')
  await loginInput.fill(existing.login)
  await page.getByRole('button', { name: 'Update' }).click()

  // Complete confirmation dialog
  await page.getByPlaceholder(account.login).fill(account.login)
  await page.getByRole('button', { name: 'Change login' }).click()

  await expect(page.getByText('Login is already taken')).toBeVisible({ timeout: 10_000 })
})
