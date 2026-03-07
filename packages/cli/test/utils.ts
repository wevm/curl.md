import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { inject, vi } from 'vitest'
import { Env } from '../../../test/env.ts'

vi.mock('../package.json', () => ({
  default: { name: 'curl.md', version: 'x.y.z' },
}))

// Must import after mock
const { default: cli } = await import('../src/cli.ts')

const env = Env.parse(inject('env'))

export function useTempHome() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-md-test-'))
  const spy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
  const origXdgData = process.env.XDG_DATA_HOME
  const origXdgConfig = process.env.XDG_CONFIG_HOME
  delete process.env.XDG_DATA_HOME
  delete process.env.XDG_CONFIG_HOME
  return {
    dir: tmpDir,
    sessionPath: path.join(
      tmpDir,
      '.local',
      'share',
      'curl-md',
      'session.json',
    ),
    cleanup() {
      spy.mockRestore()
      if (origXdgData === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = origXdgData
      if (origXdgConfig === undefined) delete process.env.XDG_CONFIG_HOME
      else process.env.XDG_CONFIG_HOME = origXdgConfig
      fs.rmSync(tmpDir, { recursive: true, force: true })
    },
  }
}

function stripUndefined(obj: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  )
}

export async function serve(
  argv: string[],
  overrides?: Record<string, string | undefined>,
) {
  let output = ''
  let exitCode: number | undefined
  await cli.serve(argv, {
    env: stripUndefined({
      CURL_MD_BASE_URL: env.CURL_MD_BASE_URL,
      ...overrides,
    }),
    stdout(s: string) {
      output += s
    },
    exit(code: number) {
      exitCode = code
    },
  })
  return { output, exitCode }
}
