import assert from 'node:assert'
import net from 'node:net'
import { createServer } from 'vite'

// Vite/Miniflare can throw uncaught socket errors (EPIPE, ECONNRESET,
// ERR_STREAM_WRITE_AFTER_END) under concurrent load when a client disconnects
// before the server finishes writing. These are benign — swallow them so the
// dev server process doesn't crash and cascade-fail all remaining tests.
process.on('uncaughtException', (err) => {
  const socketErrors = new Set(['ERR_STREAM_WRITE_AFTER_END', 'EPIPE', 'ECONNRESET'])
  if ('code' in err && socketErrors.has(err.code as string)) return
  throw err
})

const port = await new Promise<number>((resolve, reject) => {
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

// Poll until the Cloudflare worker/miniflare is reliably responding
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

process.send?.(baseUrl)
