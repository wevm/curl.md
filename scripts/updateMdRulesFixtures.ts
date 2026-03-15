import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const fixturesDir = path.resolve(import.meta.dirname, '../src/md/rules/__fixtures__')
mkdirSync(fixturesDir, { recursive: true })

const fixtures = [
  {
    name: 'mdn-array-map.md',
    url: 'https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/javascript/reference/global_objects/array/map/index.md',
  },
  {
    name: 'tailwind-padding.html',
    url: 'https://tailwindcss.com/docs/padding',
  },
  {
    name: 'github-docs-actions.json',
    url: 'https://docs.github.com/api/article?pathname=/en/actions',
  },
  {
    name: 'github-issue-2908.html',
    url: 'https://github.com/wevm/viem/issues/2908',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html',
    },
  },
] satisfies { name: string; url: string; headers?: Record<string, string> }[]

let failed = 0
for (const fixture of fixtures) {
  process.stdout.write(`Fetching ${fixture.name}`)
  try {
    const res = await fetch(fixture.url, {
      headers: fixture.headers ?? {},
      redirect: 'follow',
    })
    if (!res.ok) {
      console.log(` FAILED (${res.status})`)
      failed++
      continue
    }
    const text = await res.text()
    writeFileSync(path.join(fixturesDir, fixture.name), text)
    console.log(` OK (${(text.length / 1024).toFixed(1)}KB)`)
  } catch (err) {
    console.log(` ERROR: ${err instanceof Error ? err.message : err}`)
    failed++
  }
}

if (failed > 0) {
  console.log(`\n${failed} fixtures failed to update.`)
  process.exit(1)
}
console.log(
  '\nFixtures updated. Run `pnpm test --project app -- src/md/ --update` to update snapshots.',
)
