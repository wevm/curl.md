import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

test('published package exposes createClient types', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'curl-md-package-types-'))
  let formatted = false

  try {
    await exec('pnpm', ['--filter', 'curl.md', 'build'], { cwd: root, timeout: 120_000 })
    await exec('node', ['--experimental-strip-types', 'scripts/formatPackage.ts'], { cwd: root })
    formatted = true

    const packed = await exec('pnpm', ['--filter', 'curl.md', 'pack', '--pack-destination', dir], {
      cwd: root,
    })
    const tarball = packed.stdout.trim().split('\n').at(-1)
    expect(tarball).toBeTruthy()

    const consumer = join(dir, 'consumer')
    await mkdir(consumer)
    await writeFile(join(consumer, 'package.json'), '{"type":"module"}\n')
    await writeFile(
      join(consumer, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            module: 'nodenext',
            moduleResolution: 'nodenext',
            noEmit: true,
            strict: true,
            target: 'es2022',
          },
        },
        null,
        2,
      )}\n`,
    )
    await writeFile(
      join(consumer, 'index.ts'),
      `import { createClient, type Client } from 'curl.md'
import { Auth } from 'curl.md/internal'

const client = createClient()
const res = await client.fetch('example.com', {
  fresh: true,
  keywords: ['example'],
  mode: 'rush',
  objective: 'example domain',
})

const typed: Client = client
// @ts-expect-error internal Sentry tunnel is not SDK surface
client.api.tunnel
void Auth
void res
void typed
`,
    )

    await exec('pnpm', ['--dir', consumer, 'add', tarball!], { cwd: root, timeout: 120_000 })
    await exec('pnpm', ['exec', 'tsgo', '-p', join(consumer, 'tsconfig.json')], {
      cwd: root,
      timeout: 120_000,
    })
  } finally {
    if (formatted)
      await exec('node', ['--experimental-strip-types', 'scripts/restorePackage.ts'], { cwd: root })
    await rm(dir, { force: true, recursive: true })
  }
}, 180_000)

function exec(
  cmd: string,
  args: string[],
  options: { cwd: string; timeout?: number },
): Promise<{ stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { cwd: options.cwd, timeout: options.timeout ?? 30_000 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr.trim() || stdout.trim() || error.message))
        else resolve({ stderr, stdout })
      },
    )
  })
}
