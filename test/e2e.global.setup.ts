import { createEmulator } from 'emulate'
import { startDatabase } from './containers.ts'
import { startDevServer } from './devServer.ts'
import { Env } from './env.ts'
import { getAvailablePort } from './utils.ts'

export default async function globalSetup() {
  const env = Env.get()

  console.log('e2e: starting database')
  const container = await startDatabase()
  console.log('e2e: started database')

  console.log('e2e: starting github emulator')
  const emulator = await createEmulator({
    service: 'github',
    port: await getAvailablePort(),
    seed: {
      tokens: {
        gho_test_token: { login: 'testuser', scopes: ['user:email'] },
      },
      github: {
        users: [
          {
            login: 'testuser',
            name: 'Test User',
            email: 'test@example.com',
          },
        ],
      },
    },
  })
  console.log('e2e: started github emulator')

  console.log('e2e: starting stripe emulator')
  const stripeEmulator = await createEmulator({
    service: 'stripe',
    port: await getAvailablePort(),
  })
  console.log('e2e: started stripe emulator')

  console.log('e2e: starting dev server')
  const server = await startDevServer(container.getConnectionUri(), {
    ...env,
    GH_API_URL: emulator.url,
    GH_URL: emulator.url,
    STRIPE_API_URL: stripeEmulator.url,
  })
  console.log('e2e: started dev server')

  process.env.PLAYWRIGHT_BASE_URL = server.baseUrl
  process.env.PLAYWRIGHT_COOKIE_SECRET = process.env.COOKIE_SECRET ?? env.COOKIE_SECRET
  process.env.PLAYWRIGHT_DB_URL = container.getConnectionUri()

  return async () => {
    server.stop()
    await emulator.close()
    await stripeEmulator.close()
    await container.stop()
  }
}
