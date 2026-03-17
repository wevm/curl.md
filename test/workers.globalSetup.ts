import type { TestProject } from 'vitest/node'
import { startDatabase } from './containers.ts'
import { Env } from './env.ts'

export default async function (project: TestProject) {
  console.log(`${project.name}: starting database`)
  const container = await startDatabase()
  console.log(`${project.name}: started database`)

  project.provide('env', JSON.stringify(Env.get({ DB_URL: container.getConnectionUri() })))

  return async () => {
    await container.stop()
  }
}
