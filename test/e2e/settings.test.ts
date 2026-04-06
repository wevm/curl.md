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

test('deletes account from settings', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)
  await page.goto(`/${account.login}/settings`, { waitUntil: 'networkidle' })

  await expect(page.getByText('Danger')).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Delete account' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete account' })).toBeDisabled()

  await page.getByPlaceholder(account.login).fill(account.login)
  await page.getByRole('button', { name: 'Delete account' }).click()

  await page.waitForURL('/')
})

test('shows error when deleting account that owns an org', async ({
  factory,
  page,
  setSession,
}) => {
  const account = await factory.account.insert({})
  const org = await factory.organization.insert({})
  await factory.organization_member.insert({
    account_id: account.id,
    organization_id: org.id,
    role: 'owner',
  })
  await setSession(account.id)
  await page.goto(`/${account.login}/settings`, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByPlaceholder(account.login).fill(account.login)
  await page.getByRole('button', { name: 'Delete account' }).click()

  await expect(page.getByText('You must transfer or delete owned organizations first')).toBeVisible(
    { timeout: 10_000 },
  )
})

test('shows error when deleting account with non-zero balance', async ({
  db,
  factory,
  page,
  setSession,
}) => {
  const account = await factory.account.insert({})
  await db
    .updateTable('account')
    .set({ balance_mills: 5000 })
    .where('id', '=', account.id)
    .execute()
  await setSession(account.id)
  await page.goto(`/${account.login}/settings`, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByPlaceholder(account.login).fill(account.login)
  await page.getByRole('button', { name: 'Delete account' }).click()

  await expect(page.getByText('Account has a non-zero balance')).toBeVisible({ timeout: 10_000 })
})

test('deletes organization from settings', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  const org = await factory.organization.insert({ login: 'delete-me-org', name: 'Delete Me Org' })
  await factory.organization_member.insert({
    account_id: account.id,
    organization_id: org.id,
    role: 'owner',
  })
  await setSession(account.id)
  await page.goto(`/${org.login}/settings`, { waitUntil: 'networkidle' })

  await expect(page.getByText('Danger')).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  // Confirmation dialog
  await expect(page.getByRole('heading', { name: 'Delete organization' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete organization' })).toBeDisabled()

  // Type org login to confirm
  await page.getByPlaceholder(org.login).fill(org.login)
  await page.getByRole('button', { name: 'Delete organization' }).click()

  // Navigates to account dashboard
  await page.waitForURL(`/${account.login}`)
})

test('shows error when deleting org with non-zero balance', async ({
  db,
  factory,
  page,
  setSession,
}) => {
  const account = await factory.account.insert({})
  const org = await factory.organization.insert({})
  await factory.organization_member.insert({
    account_id: account.id,
    organization_id: org.id,
    role: 'owner',
  })
  await db
    .updateTable('organization')
    .set({ balance_mills: 5000 })
    .where('id', '=', org.id)
    .execute()
  await setSession(account.id)
  await page.goto(`/${org.login}/settings`, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByPlaceholder(org.login).fill(org.login)
  await page.getByRole('button', { name: 'Delete organization' }).click()

  await expect(page.getByText('Organization has a non-zero balance')).toBeVisible({
    timeout: 10_000,
  })
})
