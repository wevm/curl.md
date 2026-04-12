import { spawnSync } from 'node:child_process'
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
  vi.spyOn(console, 'log').mockImplementation(() => {})

  const result = await installAmpPlugin({
    ampConfigDir: tempDir,
    packageJson: { name: '@curl.md/amp', version: '0.0.1' },
    spawnSync: spawn,
  })

  expect(result.packageSpec).toBe('@curl.md/amp@0.0.1')
  expect(spawn).toHaveBeenCalledWith(
    'npm',
    ['install', '--silent', '--save-exact', '@curl.md/amp@0.0.1'],
    {
      cwd: tempDir,
      env: process.env,
      stdio: 'inherit',
    },
  )

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

test('runs when invoked through a symlinked bin path', async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'curlmd-amp-cli-'))

  const ampConfigDir = path.join(tempDir, 'amp')
  const binDir = path.join(tempDir, 'bin')
  const entryPath = path.join(tempDir, 'curlmd-amp')
  const npmPath = path.join(binDir, 'npm')

  await fs.mkdir(binDir, { recursive: true })
  await fs.writeFile(npmPath, '#!/bin/sh\nexit 0\n', 'utf8')
  await fs.chmod(npmPath, 0o755)
  await fs.symlink(path.join(process.cwd(), 'plugins/amp/install.ts'), entryPath)

  const result = spawnSync(process.execPath, ['--experimental-strip-types', entryPath, 'install'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      AMP_CONFIG_DIR: ampConfigDir,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    },
  })

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  expect(result.stdout).toContain(`Installed @curl.md/amp@`)
  expect(result.stdout).toContain(` to ${ampConfigDir}`)
  expect(result.stdout).toContain("Run 'PLUGINS=all amp' to load plugins")

  await expect(fs.readFile(path.join(ampConfigDir, 'plugins', 'curlmd.ts'), 'utf8')).resolves.toBe(
    [
      '// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now',
      "import plugin from '@curl.md/amp'",
      '',
      'export default plugin',
      '',
    ].join('\n'),
  )
})
