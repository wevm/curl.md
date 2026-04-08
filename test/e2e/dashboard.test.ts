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

test('opens add payment method dialog with a masked route', async ({
  factory,
  page,
  setSession,
}) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  await page.goto(`/${account.login}/billing`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Add payment method' }).click()

  await expect(page.getByRole('heading', { name: 'Add payment method' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/${account.login}/billing$`))

  await page.reload()

  await page.waitForURL(new RegExp(`/${account.login}/billing/add_payment_method$`))
  await expect(page.getByRole('heading', { name: 'Add payment method' })).toBeVisible()
})

test('opens add credits dialog with a masked route', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  await page.goto(`/${account.login}/billing`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { exact: true, name: 'Add $5' }).click()

  await expect(page.getByRole('heading', { name: 'Add credits' })).toBeVisible()
  await expect(page.getByText('Add prepaid credits to your account.')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/${account.login}/billing$`))

  await page.goBack()

  await expect(page.getByRole('heading', { name: 'Add credits' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add payment method' })).toBeVisible()
})

test('opens add credits dialog from the direct route', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  await page.goto(`/${account.login}/billing/add_credits/nonexistent-id`)

  await expect(page.getByRole('heading', { name: 'Add credits' })).toBeVisible()
  await expect(page.getByText('Add prepaid credits to your account.')).toBeVisible()
  await expect(page.getByText('Payment session expired or not found.')).toBeVisible()
})

test('shows tokens saved and dollar savings from requests', async ({
  factory,
  page,
  setSession,
}) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  await factory.request.insert(
    {
      account_id: account.id,
      extracted_tokens: 1000,
      filtered_tokens: null,
      markdown_tokens: 2000,
      source_tokens: 6000,
      source_tokens_method: 'html',
    },
    {
      account_id: account.id,
      extracted_tokens: null,
      filtered_tokens: 1000,
      markdown_tokens: 1500,
      source_tokens: 4000,
      source_tokens_method: 'html',
    },
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

test('shows mill precision only when needed in billing balances', async ({
  db,
  factory,
  page,
  setSession,
}) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  await db
    .updateTable('account')
    .set({ balance_mills: 5005 })
    .where('id', '=', account.id)
    .execute()

  await factory.credit_transaction.insert({
    account_id: account.id,
    amount_mills: 5005,
    balance_after_mills: 5005,
    type: 'purchase',
  })

  await page.goto(`/${account.login}/billing`)

  await expect(page.getByText('$5.005')).toHaveCount(3)
})
