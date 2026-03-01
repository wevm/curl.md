import type { TestProject } from 'vitest/node'
import { startDatabase } from './containers.ts'
import { startDevServer } from './devServer.ts'
import { Env } from './env.ts'

export default async function (project: TestProject) {
  const name = project.name || 'unknown'

  console.log(`${name}: starting database`)
  const container = await startDatabase()
  console.log(`${name}: started database`)

  console.log(`${name}: starting dev server`)
  const server = await startDevServer({ DB_URL: container.getConnectionUri() })
  console.log(`${name}: started dev server`)

  const env = Env.get({
    CURL_MD_BASE_URL: server.baseUrl,
    DB_URL: container.getConnectionUri(),
  })
  project.provide('env', JSON.stringify(env))

  return async () => {
    server.stop()
    await container.stop()
  }
}
