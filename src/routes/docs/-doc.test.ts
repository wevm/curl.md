import path from 'node:path'
import { expect, test } from 'vitest'
import { docsMdx } from '../../../config/docs.ts'

test('docs mdx rewrites codegroup directives into tabbed code group components', async () => {
  const plugin = await docsMdx()
  const source = `# Example

:::codegroup

\`\`\`sh [pnpm]
pnpm dev
\`\`\`

\`\`\`ts [config.ts]
export const config = {}
\`\`\`

:::
`

  const transformed = await plugin.transform?.call(
    {},
    source,
    path.join(process.cwd(), 'docs/reference/kitchen_sink.mdx'),
  )
  const code =
    typeof transformed === 'string'
      ? transformed
      : (transformed as { code?: string } | null | undefined)?.code

  expect(code).toContain('CodeGroup')
  expect(code).toContain('label: "pnpm"')
  expect(code).toContain('label: "config.ts"')
  expect(code).toContain('className: "language-sh"')
  expect(code).toContain('className: "language-ts"')
  expect(code).not.toContain('language-text')
  expect(code).not.toContain(':::codegroup')
})
