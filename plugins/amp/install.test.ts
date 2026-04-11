import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { getAmpConfigDir, installAmpPlugin } from './install.ts'

let tempDir: string | undefined

afterEach(async () => {
  vi.restoreAllMocks()
  if (!tempDir) return
  await fs.rm(tempDir, { force: true, recursive: true })
  tempDir = undefined
})

test('uses XDG_CONFIG_HOME when present', () => {
  const configDir = getAmpConfigDir({ XDG_CONFIG_HOME: '/tmp/xdg' }, 'linux')
  expect(configDir).toBe('/tmp/xdg/amp')
})

test('installs the package and writes the global shim', async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'curlmd-amp-install-'))
  const spawn = vi.fn(() => ({ status: 0 }))

  const result = await installAmpPlugin({
    ampConfigDir: tempDir,
    packageJson: { name: '@curl.md/amp', version: '0.0.1' },
    spawnSync: spawn,
  })

  expect(result.packageSpec).toBe('@curl.md/amp@0.0.1')
  expect(spawn).toHaveBeenCalledWith('pnpm', ['add', '--save-exact', '@curl.md/amp@0.0.1'], {
    cwd: tempDir,
    env: process.env,
    stdio: 'inherit',
  })

  await expect(fs.readFile(path.join(tempDir, 'package.json'), 'utf8')).resolves.toBe(`{
  "name": "amp-plugins",
  "private": true
}\n`)

  await expect(fs.readFile(path.join(tempDir, 'plugins', 'curlmd.ts'), 'utf8')).resolves.toBe(
    [
      '// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now',
      "import plugin from '@curl.md/amp'",
      '',
      'export default plugin',
      '',
    ].join('\n'),
  )
})
