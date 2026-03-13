import { spawn } from 'node:child_process'

export async function startDevServer(
  env: { DB_URL: string },
  retries = 3,
): Promise<{ baseUrl: string; stop: () => void }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await attemptStart(env)
    } catch (error) {
      if (attempt === retries) throw error
      console.error(
        `[devServer] attempt ${attempt} failed, retrying... (${error instanceof Error ? error.message.split('\n')[0] : error})`,
      )
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  throw new Error('unreachable')
}

async function attemptStart(env: { DB_URL: string }) {
  const proc = spawn('pnpm', ['vite', 'dev'], {
    cwd: new URL('..', import.meta.url).pathname,
    detached: true,
    env: { ...process.env, DB_URL: env.DB_URL },
    stdio: 'pipe',
  })

  const baseUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill()
      reject(
        new Error(
          `Dev server startup timeout\nstdout: ${stdout}\nstderr: ${stderr}`,
        ),
      )
    }, 90_000)

    let stderr = ''
    let stdout = ''
    const checkForUrl = (chunk: string) => {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape codes
      const clean = chunk.replace(/\x1b\[[0-9;]*m/g, '')
      const match = clean.match(/Local:\s+(http:\/\/localhost:\d+)/)
      if (!match) return
      clearTimeout(timeout)
      const url = match[1]
      if (!url) throw new Error('No url found')
      resolve(url)
    }
    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
      checkForUrl(data.toString())
    })
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
      checkForUrl(data.toString())
    })
    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
    proc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout)
        reject(
          new Error(
            `Dev server exited with code ${code}\nstdout: ${stdout}\nstderr: ${stderr}`,
          ),
        )
      }
    })
  })

  // Wait for the server to actually respond
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.ok) break
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }

  // biome-ignore lint/style/noNonNullAssertion: stable
  return { baseUrl, stop: () => process.kill(-proc.pid!, 'SIGTERM') }
}
