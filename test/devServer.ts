import assert from 'node:assert'
import { fork } from 'node:child_process'
import net from 'node:net'

const scriptPath = new URL('devServer.ts', import.meta.url).pathname

export function startDevServer(dbUrl: string, env?: Record<string, string>) {
  return new Promise<{ baseUrl: string; stop: () => void }>((resolve, reject) => {
    const child = fork(scriptPath, {
      env: { ...process.env, ...env, TEST: '1', DB_URL: dbUrl },
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

// Child process entry — only runs when forked
if (process.send) {
  // Vite/Miniflare can throw uncaught socket errors (EPIPE, ECONNRESET,
  // ERR_STREAM_WRITE_AFTER_END) under concurrent load when a client disconnects
  // before the server finishes writing. Swallow them so the process doesn't crash.
  const socketErrors = new Set(['ERR_STREAM_WRITE_AFTER_END', 'EPIPE', 'ECONNRESET'])
  process.on('uncaughtException', (err) => {
    if ('code' in err && socketErrors.has(err.code as string)) return
    throw err
  })

  const { createServer } = await import('vite')

  const port = process.env.PORT
    ? Number(process.env.PORT)
    : await new Promise<number>((resolve, reject) => {
        const server = net.createServer()
        server.listen(0, () => {
          const addr = server.address()
          assert(addr && typeof addr !== 'string')
          server.close(() => resolve(addr.port))
        })
        server.on('error', reject)
      })

  const vite = await createServer({ server: { port, strictPort: true } })
  await vite.listen()

  const address = vite.httpServer?.address()
  assert(address && typeof address !== 'string', 'Failed to get server address')
  const baseUrl = `http://localhost:${address.port}`

  const deadline = Date.now() + 30_000
  let consecutive = 0
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.ok) consecutive++
      else consecutive = 0
    } catch {
      consecutive = 0
    }
    if (consecutive >= 3) break
    await new Promise((r) => setTimeout(r, 250))
  }
  assert(consecutive >= 3, 'Dev server health check timed out')

  process.send(baseUrl)
}
