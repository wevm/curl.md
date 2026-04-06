import { expect } from '@playwright/test'
import { test } from '#test/e2e-utils.ts'

test('invalid payment session shows not found', async ({ page }) => {
  await page.goto('/credits/add/nonexistent-id')
  await expect(page.getByRole('heading', { name: 'Add Credits' })).toBeVisible()
  await expect(page.getByText('Payment session expired or not found.')).toBeVisible()
})

test('creates payment session and renders add credits page', async ({
  factory,
  page,
  setSession,
}) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  const res = await page.request.post('/api/credits/add', {
    data: { amount: '500' },
    headers: { 'content-type': 'application/json' },
  })
  expect(res.status()).toBe(200)
  const json = await res.json()
  expect(json.payment_id).toBeTruthy()

  await page.goto(`/credits/add/${json.payment_id}`)
  await expect(page.getByRole('heading', { name: 'Add Credits' })).toBeVisible()
  await expect(page.getByText('Add prepaid credits to your account.')).toBeVisible()
})

test('locked payment session hides amount selector', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  const res = await page.request.post('/api/credits/add', {
    data: { amount: '500', locked: true },
    headers: { 'content-type': 'application/json' },
  })
  expect(res.status()).toBe(200)
  const json = await res.json()

  await page.goto(`/credits/add/${json.payment_id}`)
  await expect(page.getByRole('heading', { name: 'Add Credits' })).toBeVisible()
  await expect(page.getByText('Amount: $5')).toBeVisible()
  await expect(page.getByText(/~[\d,]+ requests/)).toBeVisible()
  await expect(page.getByRole('radiogroup')).not.toBeVisible()
})
