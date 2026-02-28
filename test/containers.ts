import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { PostgreSqlContainer } from '@testcontainers/postgresql'

export async function startDatabase() {
  const container = await new PostgreSqlContainer('postgres:17-alpine')
    .withExposedPorts(5432)
    .start()

  const connectionString = container.getConnectionUri()
  const res = await promisify(exec)(
    `DB_URL=${connectionString} pnpm kysely migrate latest`,
    { cwd: process.cwd() },
  )
  if (res.stderr) console.warn(res.stderr)

  return container
}
