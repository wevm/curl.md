import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { inject, vi } from 'vitest'
import { Env } from '../../test/env.ts'
import cli from '../src/cli.ts'

const env = Env.parse(inject('env'))

export function useTempHome() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-md-test-'))
  const spy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
  return {
    dir: tmpDir,
    sessionPath: path.join(tmpDir, '.config', 'curl-md', 'session.json'),
    cleanup() {
      spy.mockRestore()
      fs.rmSync(tmpDir, { recursive: true, force: true })
    },
  }
}

export async function serve(
  argv: string[],
  overrides?: Record<string, string | undefined>,
) {
  let output = ''
  let exitCode: number | undefined
  await cli.serve(argv, {
    env: { CURL_MD_BASE_URL: env.CURL_MD_BASE_URL, ...overrides },
    stdout(s: string) {
      output += s
    },
    exit(code: number) {
      exitCode = code
    },
  })
  return { output, exitCode }
}
