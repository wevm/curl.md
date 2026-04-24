import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { discoverAndLoadExtensions } from '@mariozechner/pi-coding-agent'
import { defaultBaseUrl } from 'curl.md'
import { HttpResponse, http, passthrough } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { server } from '../test/server.ts'

let defaultHomeDir: string

beforeEach(() => {
  defaultHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-e2e-'))
  vi.stubEnv('CURLMD_API_KEY', '')
  vi.stubEnv('CURLMD_BASE_URL', '')
  vi.stubEnv('HOME', defaultHomeDir)
  vi.stubEnv('XDG_CONFIG_HOME', path.join(defaultHomeDir, '.config'))
  vi.stubEnv('XDG_DATA_HOME', path.join(defaultHomeDir, '.local', 'share'))
})

afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(defaultHomeDir, { force: true, recursive: true })
})

test('loads the md Pi extension package in RPC mode', async () => {
  const rpc = startPiRpc({
    args: ['--no-extensions', '-e', packageDir()],
    cwd: repoRoot(),
  })

  try {
    await expectStatusCommand(rpc)
  } finally {
    await rpc.stop()
  }
})

test('installs and removes md Pi package through pi install', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-package-'))
  const homeDir = path.join(tmpDir, 'home')
  const workspaceDir = path.join(tmpDir, 'workspace')
  const env = {
    ...process.env,
    HOME: homeDir,
    XDG_CONFIG_HOME: path.join(homeDir, '.config'),
    XDG_DATA_HOME: path.join(homeDir, '.local', 'share'),
  }

  fs.mkdirSync(workspaceDir, { recursive: true })

  try {
    const install = await runPiCommand(['install', packageDir()], { cwd: workspaceDir, env })
    expect(install.exitCode).toBe(0)

    const settingsPath = path.join(homeDir, '.pi', 'agent', 'settings.json')
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as { packages?: string[] }
    const settingsDir = path.dirname(settingsPath)
    const resolvedPackages = settings.packages?.map((p) => path.resolve(settingsDir, p))
    expect(resolvedPackages).toContain(packageDir())

    const installedRpc = startPiRpc({ cwd: workspaceDir, env })
    try {
      await expectStatusCommand(installedRpc)
    } finally {
      await installedRpc.stop()
    }

    const remove = await runPiCommand(['remove', packageDir()], { cwd: workspaceDir, env })
    expect(remove.exitCode).toBe(0)

    const removedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      packages?: string[]
    }
    const resolvedRemovedPackages = (removedSettings.packages || []).map((p) =>
      path.resolve(settingsDir, p),
    )
    expect(resolvedRemovedPackages).not.toContain(packageDir())

    const removedRpc = startPiRpc({ cwd: workspaceDir, env })
    try {
      removedRpc.send({ id: 'get_commands', type: 'get_commands' })
      const getCommandsResponse = await removedRpc.waitFor(
        (message) => message.type === 'response' && message.id === 'get_commands',
      )
      expect(getCommandsResponse.success).toBe(true)
      expect(getCommandsResponse.data.commands).not.toContainEqual(
        expect.objectContaining({ name: 'curl_md_status', source: 'extension' }),
      )
    } finally {
      await removedRpc.stop()
    }
  } finally {
    fs.rmSync(tmpDir, { force: true, recursive: true })
  }
})

test('registers read_web_page and curl_md through the real Pi extension loader', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curlmd-pi-loader-'))

  server.use(
    http.get('*', async ({ request }) => {
      const url = new URL(request.url)
      if (
        url.origin !== new URL(defaultBaseUrl).origin ||
        url.pathname !== '/api/https://example.com/docs'
      )
        return passthrough()
      return HttpResponse.json({ content: '# Loaded through Pi loader' })
    }),
  )

  try {
    const result = await discoverAndLoadExtensions([packageDir()], tmpDir, tmpDir)

    expect(result.errors).toEqual([])

    const tools = result.extensions.flatMap((extension) => Array.from(extension.tools.values()))
    const readWebPageTool = tools.find((tool) => tool.definition.name === 'read_web_page')
    const aliasTool = tools.find((tool) => tool.definition.name === 'curl_md')

    expect(readWebPageTool).toBeDefined()
    expect(aliasTool).toBeDefined()

    const execution = await readWebPageTool!.definition.execute(
      'call_1',
      { url: 'https://example.com/docs' },
      new AbortController().signal,
      undefined,
      {} as any,
    )

    expect(execution).toEqual({
      content: [{ type: 'text', text: '# Loaded through Pi loader' }],
      details: {
        auth: 'anon',
        cache: undefined,
        credits_remaining: undefined,
        fresh: undefined,
        keywords: undefined,
        mode: undefined,
        objective: undefined,
        request_id: undefined,
        tokens_count: undefined,
        tokens_saved: undefined,
        url: 'https://example.com/docs',
      },
    })
  } finally {
    fs.rmSync(tmpDir, { force: true, recursive: true })
  }
})

function startPiRpc(options: { args?: string[]; cwd: string; env?: NodeJS.ProcessEnv }) {
  const child = spawn(
    piBinaryPath(),
    [
      '--mode',
      'rpc',
      '--no-session',
      '--no-tools',
      '--no-skills',
      '--no-prompt-templates',
      '--no-themes',
      ...(options.args || []),
    ],
    {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  const messages: Array<Record<string, any>> = []
  const waiters: Array<{
    predicate: (message: Record<string, any>) => boolean
    reject: (error: Error) => void
    resolve: (message: Record<string, any>) => void
    timeout: ReturnType<typeof setTimeout>
  }> = []
  let parseError: Error | undefined
  let stderr = ''
  let stdout = ''

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8')
  })

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8')

    while (true) {
      const newlineIndex = stdout.indexOf('\n')
      if (newlineIndex === -1) return

      let line = stdout.slice(0, newlineIndex)
      stdout = stdout.slice(newlineIndex + 1)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      if (!line) continue

      try {
        const message = JSON.parse(line) as Record<string, any>
        messages.push(message)
        resolveWaiters(waiters, message)
      } catch (error) {
        parseError = error instanceof Error ? error : new Error(String(error))
        rejectWaiters(waiters, new Error(`Failed to parse Pi RPC output: ${line}`))
        child.kill('SIGKILL')
        return
      }
    }
  })

  child.on('error', (error) => {
    rejectWaiters(waiters, error)
  })

  child.on('exit', (code, signal) => {
    if (!waiters.length) return

    const reason =
      parseError?.message || stderr.trim() || `Pi exited with code ${code} signal ${signal}`
    rejectWaiters(waiters, new Error(reason))
  })

  return {
    messages,
    send(message: Record<string, any>) {
      child.stdin.write(`${JSON.stringify(message)}\n`)
    },
    async stop() {
      if (child.exitCode !== null) return

      child.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL')
        }, 1_000)

        child.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    },
    waitFor(predicate: (message: Record<string, any>) => boolean, timeoutMs = 10_000) {
      for (const message of messages) {
        if (predicate(message)) return Promise.resolve(message)
      }

      return new Promise<Record<string, any>>((resolve, reject) => {
        const timeout = setTimeout(() => {
          removeWaiter(waiters, waiter)
          reject(
            new Error(
              `Timed out waiting for Pi RPC message. stderr: ${stderr.trim() || '(empty)'}`,
            ),
          )
        }, timeoutMs)

        const waiter = { predicate, reject, resolve, timeout }
        waiters.push(waiter)
      })
    },
  }
}

async function expectStatusCommand(rpc: ReturnType<typeof startPiRpc>) {
  rpc.send({ id: 'get_commands', type: 'get_commands' })

  const getCommandsResponse = await rpc.waitFor(
    (message) => message.type === 'response' && message.id === 'get_commands',
  )
  expect(getCommandsResponse.success).toBe(true)
  expect(getCommandsResponse.data.commands).toContainEqual(
    expect.objectContaining({
      description: 'Show status',
      name: 'curl_md_status',
      source: 'extension',
    }),
  )

  rpc.send({ id: 'prompt_status', message: '/curl_md_status', type: 'prompt' })

  const promptResponse = await rpc.waitFor(
    (message) => message.type === 'response' && message.id === 'prompt_status',
  )
  expect(promptResponse.success).toBe(true)

  const notify = await rpc.waitFor(
    (message) =>
      message.type === 'extension_ui_request' &&
      message.method === 'notify' &&
      typeof message.message === 'string' &&
      message.message.includes('@curl.md/pi') &&
      message.message.includes('Tool: read_web_page'),
  )
  expect(notify.notifyType).toBe('info')
  expect(rpc.messages.filter((message) => message.type === 'extension_error')).toEqual([])
}

function runPiCommand(args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
  return new Promise<{ exitCode: number | null; stderr: string; stdout: string }>(
    (resolve, reject) => {
      const child = spawn(piBinaryPath(), args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stderr = ''
      let stdout = ''

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8')
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8')
      })
      child.on('error', reject)
      child.on('exit', (exitCode) => {
        resolve({ exitCode, stderr, stdout })
      })
    },
  )
}

function packageDir() {
  return path.resolve(import.meta.dirname, '..')
}

function piBinaryPath() {
  return path.resolve(packageDir(), 'node_modules', '.bin', 'pi')
}

function repoRoot() {
  return path.resolve(packageDir(), '..', '..')
}

function rejectWaiters(
  waiters: Array<{
    predicate: (message: Record<string, any>) => boolean
    reject: (error: Error) => void
    resolve: (message: Record<string, any>) => void
    timeout: ReturnType<typeof setTimeout>
  }>,
  error: Error,
) {
  for (const waiter of waiters.splice(0)) {
    clearTimeout(waiter.timeout)
    waiter.reject(error)
  }
}

function removeWaiter(
  waiters: Array<{
    predicate: (message: Record<string, any>) => boolean
    reject: (error: Error) => void
    resolve: (message: Record<string, any>) => void
    timeout: ReturnType<typeof setTimeout>
  }>,
  waiter: {
    predicate: (message: Record<string, any>) => boolean
    reject: (error: Error) => void
    resolve: (message: Record<string, any>) => void
    timeout: ReturnType<typeof setTimeout>
  },
) {
  const index = waiters.indexOf(waiter)
  if (index === -1) return
  waiters.splice(index, 1)
}

function resolveWaiters(
  waiters: Array<{
    predicate: (message: Record<string, any>) => boolean
    reject: (error: Error) => void
    resolve: (message: Record<string, any>) => void
    timeout: ReturnType<typeof setTimeout>
  }>,
  message: Record<string, any>,
) {
  for (let index = waiters.length - 1; index >= 0; index -= 1) {
    const waiter = waiters[index]!
    if (!waiter.predicate(message)) continue

    clearTimeout(waiter.timeout)
    waiters.splice(index, 1)
    waiter.resolve(message)
  }
}
