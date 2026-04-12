import { execFileSync } from 'node:child_process'
import path from 'node:path'
import mdx from '@mdx-js/rollup'
import type { Root } from 'hast'
import rehypeSlug from 'rehype-slug'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import type { Plugin as UnifiedPlugin } from 'unified'

export function docsMdx() {
  const mdxPlugin = mdx({
    rehypePlugins: [rehypeSlug, rehypeHeadings],
    remarkPlugins: [remarkFrontmatter, remarkNoticeBlocks, remarkMdxFrontmatter],
  })

  return {
    ...mdxPlugin,
    enforce: 'pre' as const,
    async transform(code: string, id: string) {
      return mdxPlugin.transform?.call(
        this,
        id.endsWith('.mdx') ? rewriteNoticeDirectiveSource(code) : code,
        id,
      )
    },
  }
}

// --- Internal ---

type Heading = { id: string; level: number; text: string }

const noticeTypeMap = new Map([
  ['caution', 'caution'],
  ['danger', 'caution'],
  ['hint', 'hint'],
  ['important', 'important'],
  ['note', 'note'],
  ['tip', 'tip'],
  ['warning', 'warning'],
])
const githubNoticeTypeMap = new Map([
  ['caution', 'caution'],
  ['important', 'important'],
  ['note', 'note'],
  ['tip', 'tip'],
  ['warning', 'warning'],
])

const remarkNoticeBlocks: UnifiedPlugin<[], any> = () => (tree) => {
  normalizeNoticeBlocks(tree)
}

const rehypeHeadings: UnifiedPlugin<[], Root> = () => (tree, file: any) => {
  const headings: Array<Heading> = []
  const lastUpdated = getLastUpdated(file.path)

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
          createExportDeclaration('headings', {
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
          }),
          createExportDeclaration('lastUpdated', toEstreeValue(lastUpdated)),
        ],
      },
    },
  })
}

const lastUpdatedCache = new Map<string, string | undefined>()

function rewriteNoticeDirectiveSource(source: string) {
  const lines = source.split('\n')
  const output: Array<string> = []
  let codeFenceMarker: string | undefined

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const fenceMarker = getCodeFenceMarker(line)
    if (fenceMarker) {
      if (!codeFenceMarker) codeFenceMarker = fenceMarker
      else if (fenceMarker[0] === codeFenceMarker[0]) codeFenceMarker = undefined
      output.push(line)
      continue
    }

    if (codeFenceMarker) {
      output.push(line)
      continue
    }

    const directive = /^:::\s*([a-z]+)(?:\s+(.*?))?\s*$/.exec(line)
    const type = normalizeNoticeType(directive?.[1])
    if (!type) {
      output.push(line)
      continue
    }

    const body: Array<string> = []
    let endIndex = index + 1
    while (endIndex < lines.length && !/^:::\s*$/.test(lines[endIndex]!)) {
      body.push(lines[endIndex]!)
      endIndex++
    }

    if (endIndex >= lines.length) {
      output.push(line)
      output.push(...body)
      break
    }

    output.push(`<Notice type=${JSON.stringify(type)}${getTitleAttribute(directive?.[2])}>`)
    if (body.length > 0) {
      output.push('')
      output.push(...body)
      output.push('')
    }
    output.push('</Notice>')
    index = endIndex
  }

  return output.join('\n')
}

function normalizeNoticeBlocks(node: any) {
  if (!node.children) return

  node.children = normalizeNoticeChildren(node.children)
  for (const child of node.children) normalizeNoticeBlocks(child)
}

function normalizeNoticeChildren(children: Array<any>) {
  const normalized: Array<any> = []

  for (let index = 0; index < children.length; index++) {
    const directive = parseNoticeDirective(children[index])
    if (directive) {
      const noticeChildren: Array<any> = []
      let endIndex = index + 1

      while (endIndex < children.length && !isNoticeDirectiveClose(children[endIndex])) {
        noticeChildren.push(children[endIndex])
        endIndex++
      }

      if (endIndex < children.length) {
        normalized.push(createNoticeNode(directive.type, noticeChildren, directive.title))
        index = endIndex
        continue
      }
    }

    const githubAlert = normalizeGithubAlert(children[index])
    if (githubAlert) {
      normalized.push(githubAlert)
      continue
    }

    normalized.push(children[index])
  }

  return normalized
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

function paragraphToText(node: any) {
  if (node?.type !== 'paragraph') return
  const text = nodeToText(node).trim()
  return text || undefined
}

function parseNoticeDirective(node: any) {
  const text = paragraphToText(node)
  if (!text) return

  const match = /^:::\s*([a-z]+)(?:\s+(.*?))?\s*$/i.exec(text)
  if (!match) return

  const type = normalizeNoticeType(match[1])
  if (!type) return

  return {
    ...(match[2]?.trim() ? { title: match[2].trim() } : {}),
    type,
  }
}

function isNoticeDirectiveClose(node: any) {
  const text = paragraphToText(node)
  return text ? /^:::\s*$/.test(text) : false
}

function normalizeGithubAlert(node: any) {
  if (node?.type !== 'blockquote' || !node.children?.length) return

  const firstChild = node.children[0]
  if (firstChild?.type !== 'paragraph') return

  const stripped = stripGithubAlertMarker(firstChild)
  if (!stripped) return

  const children = [...(stripped.paragraph ? [stripped.paragraph] : []), ...node.children.slice(1)]

  return createNoticeNode(stripped.type, children)
}

function stripGithubAlertMarker(node: any) {
  const firstChild = node.children?.[0]
  if (firstChild?.type !== 'text') return

  const match = /^\s*\[!([A-Z]+)\]\s*/.exec(firstChild.value)
  if (!match) return

  const type = githubNoticeTypeMap.get(match[1]!.toLowerCase())
  if (!type) return

  const children = [...node.children]
  const nextValue = firstChild.value.slice(match[0].length)
  if (nextValue) children[0] = { ...firstChild, value: nextValue }
  else children.shift()

  return {
    paragraph: hasParagraphContent(children) ? { ...node, children } : undefined,
    type,
  }
}

function hasParagraphContent(children: Array<any>) {
  return children.some((child) => child.type !== 'text' || child.value.trim() !== '')
}

function createNoticeNode(type: string, children: Array<any>, title?: string) {
  return {
    attributes: [
      { type: 'mdxJsxAttribute', name: 'type', value: type },
      ...(title ? [{ type: 'mdxJsxAttribute', name: 'title', value: title }] : []),
    ],
    children,
    name: 'Notice',
    type: 'mdxJsxFlowElement',
  }
}

function getCodeFenceMarker(line: string) {
  return /^(?: {0,3})(`{3,}|~{3,})/.exec(line)?.[1]
}

function getTitleAttribute(title: string | undefined) {
  return title?.trim() ? ` title=${JSON.stringify(title.trim())}` : ''
}

function normalizeNoticeType(type: string | undefined) {
  return type ? noticeTypeMap.get(type.toLowerCase()) : undefined
}

function createExportDeclaration(name: string, init: any) {
  return {
    type: 'ExportNamedDeclaration',
    specifiers: [],
    declaration: {
      type: 'VariableDeclaration',
      kind: 'const',
      declarations: [
        {
          type: 'VariableDeclarator',
          id: { type: 'Identifier', name },
          init,
        },
      ],
    },
  }
}

function getLastUpdated(filePath: string | undefined) {
  if (!filePath) return undefined

  const relativePath = path.relative(process.cwd(), filePath)
  const cached = lastUpdatedCache.get(relativePath)
  if (cached !== undefined || lastUpdatedCache.has(relativePath)) return cached

  try {
    const value = execFileSync('git', ['log', '-1', '--format=%cI', '--', relativePath], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim()
    const lastUpdated = value || undefined
    lastUpdatedCache.set(relativePath, lastUpdated)
    return lastUpdated
  } catch {
    lastUpdatedCache.set(relativePath, undefined)
    return undefined
  }
}

function toEstreeValue(value: string | undefined) {
  if (value === undefined) return { type: 'Identifier', name: 'undefined' }
  return { type: 'Literal', value }
}
