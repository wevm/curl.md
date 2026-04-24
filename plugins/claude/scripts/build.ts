import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

console.log('Building Claude plugin bundle.')

const pluginRoot = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(pluginRoot, '../..')
const outdir = path.join(pluginRoot, 'dist')

await fs.rm(outdir, { force: true, recursive: true })

execFileSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  [
    'exec',
    'esbuild',
    path.join(pluginRoot, 'src', 'server.ts'),
    '--alias:curl.md/internal=' + path.join(repoRoot, 'cli', 'src', 'exports', 'internal.ts'),
    '--alias:curl.md=' + path.join(repoRoot, 'cli', 'src', 'exports', 'index.ts'),
    '--bundle',
    '--format=esm',
    '--legal-comments=none',
    '--outfile=' + path.join(outdir, 'server.js'),
    '--platform=node',
    '--target=node22',
  ],
  { stdio: 'inherit' },
)

console.log('Done.')
