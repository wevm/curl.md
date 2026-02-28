import type { TestProject } from 'vitest/node'
import { startDatabase } from './containers.ts'
import { Env } from './env.ts'

export default async function (project: TestProject) {
  const name = project.name || 'unknown'
  console.log(`${name}: starting database`)
  const container = await startDatabase()
  console.log(`${name}: database started`)

  project.provide('env', JSON.stringify(Env.get(container.getConnectionUri())))

  return async () => {
    await container.stop()
  }
}
