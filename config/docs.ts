import mdx from '@mdx-js/rollup'
import type { Root } from 'hast'
import rehypeSlug from 'rehype-slug'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import type { Plugin as UnifiedPlugin } from 'unified'

export function docsMdx() {
  return {
    enforce: 'pre' as const,
    ...mdx({
      rehypePlugins: [rehypeSlug, rehypeHeadings],
      remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
    }),
  }
}

// --- Internal ---

type Heading = { id: string; level: number; text: string }

const rehypeHeadings: UnifiedPlugin<[], Root> = () => (tree) => {
  const headings: Array<Heading> = []

  visit(tree, (node: any) => {
    if (node.type === 'element' && /^h[2-4]$/.test(node.tagName) && node.properties?.id) {
      headings.push({
        id: node.properties.id,
        level: Number.parseInt(node.tagName[1]),
        text: nodeToText(node),
      })
    }
  })

  tree.children.push({
    type: 'mdxjsEsm' as any,
    value: '',
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        body: [
          {
            type: 'ExportNamedDeclaration',
            specifiers: [],
            declaration: {
              type: 'VariableDeclaration',
              kind: 'const',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: 'headings' },
                  init: {
                    type: 'ArrayExpression',
                    elements: headings.map((h) => ({
                      type: 'ObjectExpression',
                      properties: [
                        {
                          type: 'Property',
                          kind: 'init',
                          key: { type: 'Identifier', name: 'id' },
                          value: { type: 'Literal', value: h.id },
                          computed: false,
                          method: false,
                          shorthand: false,
                        },
                        {
                          type: 'Property',
                          kind: 'init',
                          key: { type: 'Identifier', name: 'level' },
                          value: { type: 'Literal', value: h.level },
                          computed: false,
                          method: false,
                          shorthand: false,
                        },
                        {
                          type: 'Property',
                          kind: 'init',
                          key: { type: 'Identifier', name: 'text' },
                          value: { type: 'Literal', value: h.text },
                          computed: false,
                          method: false,
                          shorthand: false,
                        },
                      ],
                    })),
                  },
                },
              ],
            },
          },
        ],
      },
    },
  })
}

function visit(node: any, fn: (node: any) => void) {
  fn(node)
  if (node.children) for (const child of node.children) visit(child, fn)
}

function nodeToText(node: any): string {
  if (node.type === 'text') return node.value
  if (node.children) return node.children.map(nodeToText).join('')
  return ''
}
