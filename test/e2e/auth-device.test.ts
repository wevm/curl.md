import { expect } from '@playwright/test'
import { test } from '#test/e2e-utils.ts'

test('redirects to login when not authenticated', async ({ page }) => {
  await page.goto('/auth/device?user_code=ABCD1234')
  await page.waitForURL(/\/login/)
})

test('shows missing code message when no user_code', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)
  await page.goto('/auth/device')
  await expect(page.getByRole('heading', { name: 'Device confirmation' })).toBeVisible()
  await expect(page.getByText('Confirm this is the code displayed in your terminal.')).toBeVisible()
  await expect(
    page.getByText('No device code provided. Use the link from your terminal to confirm a device.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm code' })).not.toBeVisible()
})

test('shows device confirmation and confirms code', async ({ db, factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  const user_code = 'TESTCODE'
  await db
    .insertInto('device_code')
    .values({
      code: 'test-device-code',
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      status: 'pending',
      user_code,
    })
    .execute()

  await page.goto(`/auth/device?user_code=${user_code}`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Device confirmation' })).toBeVisible()

  for (const char of user_code.split(''))
    await expect(page.getByText(char, { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Confirm code' }).click()
  await expect(page.getByRole('heading', { name: 'Device confirmation' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByText('Confirm this is the code displayed in your terminal.')).toBeVisible()
  await expect(page.getByText('Code confirmed. Return to your terminal.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm code' })).not.toBeVisible()

  const deviceCode = await db
    .selectFrom('device_code')
    .where('user_code', '=', user_code)
    .select(['account_id', 'status'])
    .executeTakeFirst()
  expect(deviceCode?.status).toBe('approved')
  expect(deviceCode?.account_id).toBe(account.id)
})

test('shows success banner when code_confirmed is already set', async ({
  factory,
  page,
  setSession,
}) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  await page.goto('/auth/device?user_code=RVCV4AED&code_confirmed=true', {
    waitUntil: 'networkidle',
  })

  await expect(page.getByRole('heading', { name: 'Device confirmation' })).toBeVisible()
  await expect(page.getByText('Confirm this is the code displayed in your terminal.')).toBeVisible()
  await expect(page.getByText('Code confirmed. Return to your terminal.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Cancel' })).not.toBeVisible()
})

test('shows error for invalid code', async ({ factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  await page.goto('/auth/device?user_code=INVALIDX', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Confirm code' }).click()
  await expect(page.getByRole('heading', { name: 'Device confirmation' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByText('Confirm this is the code displayed in your terminal.')).toBeVisible()
  await expect(page.getByText('Invalid or expired code')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm code' })).not.toBeVisible()
  await expect(page.getByRole('link', { name: 'Cancel' })).not.toBeVisible()
})

test('shows error for expired code', async ({ db, factory, page, setSession }) => {
  const account = await factory.account.insert({})
  await setSession(account.id)

  const user_code = 'EXPIRED1'
  await db
    .insertInto('device_code')
    .values({
      code: 'test-expired-code',
      expires_at: new Date(Date.now() - 1000),
      status: 'pending',
      user_code,
    })
    .execute()

  await page.goto(`/auth/device?user_code=${user_code}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Confirm code' }).click()
  await expect(page.getByRole('heading', { name: 'Device confirmation' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByText('Confirm this is the code displayed in your terminal.')).toBeVisible()
  await expect(page.getByText('Invalid or expired code')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm code' })).not.toBeVisible()
  await expect(page.getByRole('link', { name: 'Cancel' })).not.toBeVisible()
})
