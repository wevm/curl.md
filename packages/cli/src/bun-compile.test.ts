import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

function exec(
  cmd: string,
  args: string[],
  options?: { env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: 30_000, env: { ...process.env, ...options?.env } },
      (error, stdout, stderr) => {
        if (error)
          reject(new Error(stderr?.trim() || stdout?.trim() || error.message))
        else resolve({ stdout, stderr })
      },
    )
  })
}

describe('bun build --compile', () => {
  let dir: string
  let bin: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'curl-md-bun-'))
    bin = join(dir, 'curl-md')

    await exec('bun', [
      'build',
      join(import.meta.dirname, 'bin.ts'),
      '--compile',
      '--outfile',
      bin,
    ])
  }, 120_000)

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('shows version', async () => {
    const { stdout } = await exec(bin, ['--version'])
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  test('shows help', async () => {
    const { stdout } = await exec(bin, ['--help'])
    expect(stdout).toContain('curl.md')
    expect(stdout).toContain('Fetch any URL as Markdown')
    expect(stdout).toContain('auth')
    expect(stdout).toContain('org')
    expect(stdout).toContain('update')
  })

  test('shows subcommand help', async () => {
    const { stdout } = await exec(bin, ['auth', '--help'])
    expect(stdout).toContain('login')
    expect(stdout).toContain('logout')
    expect(stdout).toContain('check')
  })

  test('errors on missing url', async () => {
    try {
      await exec(bin, [])
      expect.unreachable()
    } catch (error) {
      expect((error as Error).message).toContain('VALIDATION_ERROR')
    }
  })

  test('errors on invalid url', async () => {
    try {
      await exec(bin, ['!!!invalid'])
      expect.unreachable()
    } catch (error) {
      expect((error as Error).message).toContain('INVALID_URL')
    }
  })

  test('fetches example.com', async () => {
    const server = createServer((_, res) => {
      res.writeHead(200, { 'content-type': 'text/markdown' })
      res.end(
        '# Example Domain\n\nThis domain is for use in illustrative examples.',
      )
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as { port: number }).port
    try {
      const { stdout } = await exec(bin, ['example.com'], {
        env: { CURL_MD_BASE_URL: `http://localhost:${port}` },
      })
      expect(stdout).toContain('Example Domain')
    } finally {
      server.close()
    }
  })
})
