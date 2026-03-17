import { fork } from 'node:child_process'
import type { TestProject } from 'vitest/node'
import { startDatabase } from '#test/containers.ts'
import { Env } from '#test/env.ts'

export default async function (project: TestProject) {
  console.log(`${project.name}: starting database`)
  const container = await startDatabase()
  console.log(`${project.name}: started database`)

  console.log(`${project.name}: starting dev server`)
  const dbUrl = container.getConnectionUri()
  const server = await startDevServer(dbUrl)
  console.log(`${project.name}: started dev server`)

  const env = Env.get({
    CURLMD_BASE_URL: server.baseUrl,
    DB_URL: dbUrl,
  })
  project.provide('env', JSON.stringify(env))

  return async () => {
    server.stop()
    await container.stop()
  }
}

function startDevServer(dbUrl: string) {
  return new Promise<{ baseUrl: string; stop: () => void }>((resolve, reject) => {
    const child = fork(new URL('devServer.ts', import.meta.url).pathname, {
      env: { ...process.env, DB_URL: dbUrl },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      execArgv: ['--experimental-strip-types', '--no-warnings'],
      detached: true,
    })

    let stderr = ''
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`Dev server startup timeout\n${stderr}`))
    }, 60_000)

    child.on('message', (baseUrl: string) => {
      clearTimeout(timeout)
      resolve({
        baseUrl,
        stop: () => {
          try {
            // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion -- child.pid is set
            process.kill(-child.pid!, 'SIGTERM')
          } catch {}
        },
      })
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout)
        reject(new Error(`Dev server exited with code ${code}\n${stderr}`))
      }
    })
  })
}
