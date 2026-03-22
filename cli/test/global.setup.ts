import type { TestProject } from 'vitest/node'
import { startDatabase } from '#test/containers.ts'
import { startDevServer } from '#test/devServer.ts'
import { Env } from '#test/env.ts'

export default async function (project: TestProject) {
  console.log(`${project.name}: starting database`)
  const container = await startDatabase()
  console.log(`${project.name}: started database`)

  console.log(`${project.name}: starting dev server`)
  const dbUrl = container.getConnectionUri()
  const env = Env.get({ DB_URL: dbUrl })
  const server = await startDevServer(dbUrl, env)
  console.log(`${project.name}: started dev server`)

  project.provide('env', JSON.stringify({ ...env, CURLMD_BASE_URL: server.baseUrl }))

  return async () => {
    server.stop()
    await container.stop()
  }
}
