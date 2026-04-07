import { expect } from '@playwright/test'
import { test } from '#test/e2e-utils.ts'

test('shows stats with zero values for new account', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)
  await page.goto(`/${account.login}`)

  await expect(page.getByText('Tokens Saved')).toBeVisible()
  await expect(page.getByText('Cost Saved')).toBeVisible()

  // Credits and payment method are on the billing page
  await page.goto(`/${account.login}/billing`)
  await expect(page.getByText('Credits Remaining')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add payment method' })).toBeVisible()
})

test('opens add payment method dialog from query param', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  await page.goto(`/${account.login}/billing?modal=add_payment_method`)

  await expect(page.getByRole('heading', { name: 'Add payment method' })).toBeVisible()
})

test('shows tokens saved and dollar savings from requests', async ({
  factory,
  page,
  setSession,
}) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  await factory.request.insert(
    { account_id: account.id, tokens_saved: 5000 },
    { account_id: account.id, tokens_saved: 3000 },
  )

  await page.goto(`/${account.login}`)

  await expect(page.getByText('8,000')).toBeVisible()
  await expect(page.getByText('$0.02')).toBeVisible()
})

test('shows credit balance', async ({ db, factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  await db
    .updateTable('account')
    .set({ balance_mills: 50000 })
    .where('id', '=', account.id)
    .execute()

  await page.goto(`/${account.login}/billing`)

  await expect(page.getByText('$50.00')).toBeVisible({ timeout: 10000 })
})
