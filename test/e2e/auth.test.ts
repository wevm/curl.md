import { expect, test } from '@playwright/test'

test('login via GitHub OAuth', async ({ page }) => {
  await page.goto('/login')

  // Click the GitHub sign-in link
  await page.getByRole('link', { name: /continue with github/i }).click()

  // On the emulate authorize page, click the seeded user
  await page.getByRole('button', { name: /testuser/i }).click()

  // Should redirect back to the app at /{login}
  await page.waitForURL('/testuser')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test('login page shows github sign-in', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('link', { name: /continue with github/i })).toBeVisible()
})
