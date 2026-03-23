import { test as base } from '@playwright/test'
import { createClient, type Database } from '#db/client.ts'
import * as Cookie from '#lib/cookie.ts'
import { createFactory } from '#test/factory.ts'

export const test = base.extend<{
  db: Database
  factory: ReturnType<typeof createFactory>
  setSession: (accountId: string) => Promise<void>
}>({
  // oxlint-disable-next-line no-empty-pattern: playwright requires destructuring
  db: async ({}, use) => {
    const db = createClient(process.env.PLAYWRIGHT_DB_URL, { max: 1 })
    await use(db)
    await db.destroy()
  },
  factory: async ({ db }, use) => {
    await use(createFactory(db))
  },
  setSession: async ({ context, factory }, use) => {
    await use(async (accountId: string) => {
      const session = await factory.session.insert({ account_id: accountId })
      const headerValue = await Cookie.generateSigned(
        'curl.session',
        session.id,
        process.env.PLAYWRIGHT_COOKIE_SECRET,
      )
      const cookieValue = decodeURIComponent(
        headerValue.split(';')[0]!.split('=').slice(1).join('='),
      )
      await context.addCookies([
        {
          name: 'curl.session',
          value: cookieValue,
          url: process.env.PLAYWRIGHT_BASE_URL,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ])
    })
  },
})
