import assert from 'node:assert'
import net from 'node:net'
import { createServer } from 'vite'

const port = await new Promise<number>((resolve, reject) => {
  const srv = net.createServer()
  srv.listen(0, () => {
    const addr = srv.address()
    assert(addr && typeof addr !== 'string')
    srv.close(() => resolve(addr.port))
  })
  srv.on('error', reject)
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
