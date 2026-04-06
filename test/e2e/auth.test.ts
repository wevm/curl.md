import { expect, test } from '@playwright/test'

test('login page shows github sign-in', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('link', { name: /continue with github/i })).toBeVisible()
})

test('login via GitHub OAuth', async ({ page }) => {
  await page.goto('/login')

  // Click the GitHub sign-in link
  await page.getByRole('link', { name: /continue with github/i }).click()

  // On the emulate authorize page, click the seeded user
  await page.getByRole('button', { name: /testuser/i }).click()

  // Should redirect back to the app at /{login}
  await page.waitForURL('/testuser')
  await expect(page.getByText('Tokens Saved')).toBeVisible()

  // Visiting /login while authenticated should redirect to dashboard
  await page.goto('/login')
  await page.waitForURL('/testuser')
  await expect(page.getByText('Tokens Saved')).toBeVisible()
})

test('error page displays error and description', async ({ page }) => {
  await page.goto('/auth/error?error=server_error&error_description=Failed+to+reach+GitHub')

  await expect(page.getByRole('heading', { name: 'server error' })).toBeVisible()
  await expect(page.getByText('Failed to reach GitHub')).toBeVisible()
  await expect(page.getByRole('link', { name: /try again/i })).toHaveAttribute('href', '/login')
})
