import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import mdx from '@mdx-js/rollup'
import json from '@shikijs/langs/json'
import shellscript from '@shikijs/langs/shellscript'
import typescript from '@shikijs/langs/typescript'
import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
import githubDarkDefault from '@shikijs/themes/github-dark-default'
import githubLightDefault from '@shikijs/themes/github-light-default'
import type { Root } from 'hast'
import rehypeSlug from 'rehype-slug'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import { createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import type { Plugin as UnifiedPlugin } from 'unified'
import type { Plugin as VitePlugin, ResolvedConfig } from 'vite'
import { parse as parseYaml } from 'yaml'
import { sidebar, type SidebarItem } from '../docs/_sidebar.ts'
import { createDocCopySource } from '../src/routes/docs/-source.ts'

export async function docsMdx() {
  let isServe = false
  const highlighter = await docsCodeHighlighterPromise
  type ConfigResolvedHook = (this: unknown, config: ResolvedConfig) => void | Promise<void>
  type HandleHotUpdateHook = (this: unknown, ctx: { file: string }) => unknown
  type TransformHook = (this: unknown, code: string, id: string) => unknown
  const mdxPlugin = mdx({
    rehypePlugins: [
      rehypeSlug,
      rehypeHeadings(() => isServe),
      rehypePromptShellBlocks,
      [rehypeShikiFromHighlighter, highlighter, docsCodeHighlightOptions],
      rehypeInlineShikiCode,
    ],
    remarkPlugins: [remarkFrontmatter, remarkGfm, remarkNoticeBlocks, remarkMdxFrontmatter],
  }) as VitePlugin
  const configResolvedHook = (
    typeof mdxPlugin.configResolved === 'function'
      ? mdxPlugin.configResolved
      : mdxPlugin.configResolved?.handler
  ) as ConfigResolvedHook | undefined
  const transformHook = (
    typeof mdxPlugin.transform === 'function' ? mdxPlugin.transform : mdxPlugin.transform?.handler
  ) as TransformHook | undefined
  const handleHotUpdateHook = (
    typeof mdxPlugin.handleHotUpdate === 'function'
      ? mdxPlugin.handleHotUpdate
      : mdxPlugin.handleHotUpdate?.handler
  ) as HandleHotUpdateHook | undefined

  return {
    ...mdxPlugin,
    async configResolved(config: ResolvedConfig) {
      isServe = config.command === 'serve'
      await syncDocsStaticAssets()
      return configResolvedHook?.call(this, config)
    },
    enforce: 'pre' as const,
    async handleHotUpdate(ctx: { file: string }) {
      if (isDocsAssetDependency(ctx.file)) await syncDocsStaticAssets()
      return handleHotUpdateHook?.call(this, ctx)
    },
    async transform(code: string, id: string) {
      const parsedId = parseDocsMdxId(id)
      if (parsedId?.searchParams.has('raw')) return code

      return transformHook?.call(this, parsedId ? rewriteDocsDirectiveSource(code) : code, id)
    },
  }
}

// --- Internal ---

type Heading = { id: string; level: number; text: string }

const docsCodeThemeDarkName = 'github-dark-default'
const docsCodeThemeLightName = 'github-light-default'

const docsCodeHighlightOptions = {
  addLanguageClass: true,
  defaultColor: false,
  defaultLanguage: 'text',
  fallbackLanguage: 'text',
  inline: 'tailing-curly-colon',
  langAlias: {
    bash: 'sh',
    shell: 'sh',
    zsh: 'sh',
  },
  parseMetaString: parseCodeBlockMetaString,
  themes: {
    dark: docsCodeThemeDarkName,
    light: docsCodeThemeLightName,
  },
} as const
const docsCodeHighlighterPromise = createDocsCodeHighlighter()

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

function rehypeHeadings(shouldUseFileModifiedFallback: () => boolean): UnifiedPlugin<[], Root> {
  return () => (tree, file: any) => {
    const headings: Array<Heading> = []
    const lastUpdated = getLastUpdated(file.path, shouldUseFileModifiedFallback())

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
}

const lastUpdatedCache = new Map<string, string | undefined>()
const docsDirectoryPath = path.join(process.cwd(), 'docs')
const docsGeneratedManifestPath = path.join(process.cwd(), 'public/docs/.generated-docs.json')
const docsPublicDirectoryPath = path.dirname(docsGeneratedManifestPath)

function parseDocsMdxId(id: string) {
  const [path, query = ''] = id.split('?', 2)
  if (!path?.endsWith('.mdx')) return

  return { path, searchParams: new URLSearchParams(query) }
}

function rewriteDocsDirectiveSource(source: string) {
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

    const codeGroup = rewriteCodeGroupDirective(lines, index)
    if (codeGroup) {
      output.push(...codeGroup.lines)
      index = codeGroup.endIndex
      continue
    }

    const steps = rewriteStepsDirective(lines, index)
    if (steps) {
      output.push(...steps.lines)
      index = steps.endIndex
      continue
    }

    const notice = rewriteNoticeDirective(lines, index)
    if (notice) {
      output.push(...notice.lines)
      index = notice.endIndex
      continue
    }

    output.push(line)
  }

  return output.join('\n')
}

function rewriteNoticeDirective(lines: Array<string>, index: number) {
  const directive = /^:::\s*([a-z]+)(?:\s+(.*?))?\s*$/.exec(lines[index]!)
  const type = normalizeNoticeType(directive?.[1])
  if (!type) return

  const body = collectDirectiveBody(lines, index)
  if (!body) return

  return {
    endIndex: body.endIndex,
    lines: [
      `<Notice type=${JSON.stringify(type)}${getTitleAttribute(directive?.[2])}>`,
      ...(body.body.length > 0 ? ['', ...body.body, ''] : []),
      '</Notice>',
    ],
  }
}

function rewriteCodeGroupDirective(lines: Array<string>, index: number) {
  if (!/^:::\s*codegroup\s*$/i.test(lines[index]!)) return

  const body = collectDirectiveBody(lines, index)
  if (!body) return

  const rewrittenBody = rewriteCodeGroupItems(body.body)
  if (!rewrittenBody) return

  return {
    endIndex: body.endIndex,
    lines: ['<CodeGroup>', '', ...rewrittenBody, '', '</CodeGroup>'],
  }
}

function rewriteStepsDirective(lines: Array<string>, index: number) {
  if (!/^:::\s*steps\s*$/i.test(lines[index]!)) return

  const body = collectDirectiveBody(lines, index)
  if (!body) return

  const rewrittenBody = rewriteStepsItems(body.body)
  if (!rewrittenBody) return

  return {
    endIndex: body.endIndex,
    lines: ['<Steps>', '', ...rewrittenBody, '', '</Steps>'],
  }
}

function collectDirectiveBody(lines: Array<string>, index: number) {
  const body: Array<string> = []
  let codeFenceMarker: string | undefined

  for (let endIndex = index + 1; endIndex < lines.length; endIndex++) {
    const line = lines[endIndex]!
    const fenceMarker = getCodeFenceMarker(line)
    if (fenceMarker) {
      if (!codeFenceMarker) codeFenceMarker = fenceMarker
      else if (isMatchingFenceMarker(fenceMarker, codeFenceMarker)) codeFenceMarker = undefined
      body.push(line)
      continue
    }

    if (!codeFenceMarker && /^:::\s*$/.test(line)) return { body, endIndex }
    body.push(line)
  }
}

function rewriteCodeGroupItems(lines: Array<string>) {
  const rewritten: Array<string> = []
  let itemCount = 0

  for (let index = 0; index < lines.length; ) {
    const line = lines[index]!
    if (!line.trim()) {
      index++
      continue
    }

    const item = rewriteCodeGroupItem(lines, index)
    if (!item) return

    rewritten.push(...item.lines)
    index = item.endIndex + 1
    itemCount++
  }

  return itemCount > 0 ? rewritten : undefined
}

function rewriteCodeGroupItem(lines: Array<string>, index: number) {
  const fence = /^(?: {0,3})(`{3,}|~{3,})(.*)$/.exec(lines[index]!)
  if (!fence) return

  const marker = fence[1]!
  const { info, label } = splitCodeGroupFenceInfo(fence[2] ?? '')
  const rewritten = [`<CodeGroupItem${getLabelAttribute(label)}>`]

  rewritten.push('')
  rewritten.push(getCodeFenceLine(marker, info))

  for (let endIndex = index + 1; endIndex < lines.length; endIndex++) {
    const line = lines[endIndex]!
    rewritten.push(line)
    if (!isClosingCodeFence(line, marker)) continue

    rewritten.push('')
    rewritten.push('</CodeGroupItem>')

    return { endIndex, lines: rewritten }
  }
}

function rewriteStepsItems(lines: Array<string>) {
  const rewritten: Array<string> = []
  let itemCount = 0

  for (let index = 0; index < lines.length; ) {
    const line = lines[index]!
    if (!line.trim()) {
      index++
      continue
    }

    const item = rewriteStepsItem(lines, index)
    if (!item) return

    if (rewritten.length > 0) rewritten.push('')
    rewritten.push(...item.lines)
    index = item.endIndex + 1
    itemCount++
  }

  return itemCount > 0 ? rewritten : undefined
}

function rewriteStepsItem(lines: Array<string>, index: number) {
  const line = lines[index]
  if (!line) return

  const heading = parseStepHeading(line)
  if (!heading) return

  const body: Array<string> = []
  let codeFenceMarker: string | undefined

  for (let endIndex = index + 1; endIndex < lines.length; endIndex++) {
    const line = lines[endIndex]!
    const fenceMarker = getCodeFenceMarker(line)
    if (fenceMarker) {
      if (!codeFenceMarker) codeFenceMarker = fenceMarker
      else if (isMatchingFenceMarker(fenceMarker, codeFenceMarker)) codeFenceMarker = undefined
      body.push(line)
      continue
    }

    if (!codeFenceMarker && parseStepHeading(line))
      return createStepItemRewrite(heading.title, trimBlankLines(body), endIndex - 1)

    body.push(line)
  }

  return createStepItemRewrite(heading.title, trimBlankLines(body), lines.length - 1)
}

function splitCodeGroupFenceInfo(info: string) {
  const trimmed = info.trim()
  if (!trimmed) return { info: '', label: undefined }

  const match = /^(.*?)(?:\s+\[([^\]]+)\])?$/.exec(trimmed)
  return {
    info: match?.[1]?.trim() ?? trimmed,
    label: match?.[2]?.trim() || undefined,
  }
}

function parseStepHeading(line: string) {
  const match = /^(?: {0,3})#{2,6}[ \t]+(.+?)\s*$/.exec(line)
  const rawTitle = match?.[1]?.trim()
  if (!rawTitle) return

  const title = rawTitle.replace(/[ \t]+#+[ \t]*$/, '').trim()
  return title ? { title } : undefined
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

function isClosingCodeFence(line: string, marker: string) {
  const fenceMarker = /^(?: {0,3})(`{3,}|~{3,})\s*$/.exec(line)?.[1]
  return fenceMarker
    ? isMatchingFenceMarker(fenceMarker, marker) && fenceMarker.length >= marker.length
    : false
}

function isMatchingFenceMarker(marker: string, other: string) {
  return marker[0] === other[0]
}

function getCodeFenceLine(marker: string, info: string) {
  return info ? `${marker} ${info}` : marker
}

function getTitleAttribute(title: string | undefined) {
  return title?.trim() ? ` title=${JSON.stringify(title.trim())}` : ''
}

function getLabelAttribute(label: string | undefined) {
  return label?.trim() ? ` label=${JSON.stringify(label.trim())}` : ''
}

function parseCodeBlockMetaString(metaString: string) {
  const match = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|([^\s]+))/u.exec(metaString)
  const hasShellPrompt = /(?:^|\s)shell-prompt(?:\s|$)/u.test(metaString)
  const title = match?.[1] ?? match?.[2] ?? match?.[3]
  if (!hasShellPrompt && !title?.trim()) return undefined

  return {
    ...(hasShellPrompt ? { 'data-shell-prompt': '' } : {}),
    ...(title?.trim() ? { title: title.trim() } : {}),
  }
}

const shellCodeLanguages = new Set(['bash', 'shell', 'sh', 'zsh'])

const rehypePromptShellBlocks: UnifiedPlugin<[], Root> = () => (tree) => {
  visit(tree, (node: any) => {
    if (node.type !== 'element' || node.tagName !== 'pre') return

    const codeNode = node.children?.find(
      (child: any) => child.type === 'element' && child.tagName === 'code',
    )
    if (!codeNode) return

    const language = getCodeLanguageFromClassName(codeNode.properties?.className)
    if (!language || !shellCodeLanguages.has(language)) return

    const source = nodeToText(codeNode)
    const lines = source.split('\n')
    const nonEmptyLines = lines.filter((line) => line.trim() !== '')
    if (!nonEmptyLines.length || nonEmptyLines.some((line) => !line.startsWith('$ '))) return

    codeNode.children = [{ type: 'text', value: lines.map(stripPromptShellLine).join('\n') }]
    codeNode.data = {
      ...codeNode.data,
      meta: appendMetaString(codeNode.data?.meta, 'shell-prompt'),
    }
  })
}

const rehypeInlineShikiCode: UnifiedPlugin<[], Root> = () => (tree) => {
  visit(tree, (node: any) => {
    if (node.type !== 'element' || node.tagName !== 'span') return
    if (!hasClassName(node.properties, 'shiki')) return

    const codeNode = node.children?.find(
      (child: any) => child.type === 'element' && child.tagName === 'code',
    )
    if (!codeNode) return

    delete node.properties?.tabindex
    node.properties = {
      ...node.properties,
      'data-shiki-inline-code': '',
    }
    codeNode.properties = {
      ...codeNode.properties,
      'data-shiki-inline-code': '',
    }
  })
}

function appendMetaString(meta: unknown, value: string) {
  if (typeof meta !== 'string' || !meta.trim()) return value
  return /(?:^|\s)shell-prompt(?:\s|$)/u.test(meta) ? meta : `${meta} ${value}`
}

function getCodeLanguageFromClassName(className: unknown) {
  const value = Array.isArray(className)
    ? className.filter((item): item is string => typeof item === 'string').join(' ')
    : typeof className === 'string'
      ? className
      : ''

  return /\blanguage-([\w-]+)/.exec(value)?.[1]
}

function hasClassName(properties: Record<string, unknown> | undefined, className: string) {
  if (!properties) return false

  const value = [properties.class, properties.className]
    .flatMap((item) =>
      Array.isArray(item)
        ? item.filter((value): value is string => typeof value === 'string')
        : typeof item === 'string'
          ? [item]
          : [],
    )
    .join(' ')

  return new RegExp(`(?:^|\\s)${className}(?:\\s|$)`, 'u').test(value)
}

function stripPromptShellLine(line: string) {
  return line.startsWith('$ ') ? line.slice(2) : line
}

function createStepItemRewrite(title: string, body: Array<string>, endIndex: number) {
  return {
    endIndex,
    lines: [`<Step title=${JSON.stringify(title)}>`].concat(
      body.length > 0 ? ['', ...body, '', '</Step>'] : ['</Step>'],
    ),
  }
}

function trimBlankLines(lines: Array<string>) {
  let start = 0
  let end = lines.length

  while (start < end && !lines[start]!.trim()) start++
  while (end > start && !lines[end - 1]!.trim()) end--

  return lines.slice(start, end)
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

function createDocsCodeHighlighter() {
  return createHighlighterCore({
    engine: createOnigurumaEngine(() => import('shiki/wasm')),
    langs: [json, shellscript, typescript],
    themes: [githubDarkDefault, githubLightDefault],
  })
}

function getLastUpdated(filePath: string | undefined, useFileModifiedFallback: boolean) {
  if (!filePath) return undefined

  const relativePath = path.relative(process.cwd(), filePath)
  if (!useFileModifiedFallback) {
    const cached = lastUpdatedCache.get(relativePath)
    if (cached !== undefined || lastUpdatedCache.has(relativePath)) return cached
  }

  try {
    const value = execFileSync('git', ['log', '-1', '--format=%cI', '--', relativePath], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim()
    const lastUpdated = value || undefined
    if (lastUpdated === undefined && useFileModifiedFallback) return getFileModifiedAt(filePath)
    if (!useFileModifiedFallback) lastUpdatedCache.set(relativePath, lastUpdated)
    return lastUpdated
  } catch {
    if (useFileModifiedFallback) return getFileModifiedAt(filePath)
    lastUpdatedCache.set(relativePath, undefined)
    return undefined
  }
}

async function syncDocsStaticAssets() {
  const docs = await readDocsStaticFiles()
  const docsWithRewrittenLinks = docs.map((doc) => ({
    ...doc,
    source: rewriteGeneratedDocLinks(doc.source),
  }))
  const docsByPath = new Map(docs.map((doc) => [doc.path, doc]))
  const files = [
    {
      filePath: path.join(docsPublicDirectoryPath, 'llms-full.txt'),
      content: generateDocsLlmsFullTxt({ docs: docsWithRewrittenLinks }),
    },
    {
      filePath: path.join(docsPublicDirectoryPath, 'llms.txt'),
      content: generateDocsLlmsTxt({ sections: getDocsLlmsSections(docsByPath) }),
    },
    ...docsWithRewrittenLinks.map((doc) => ({
      filePath: path.join(docsPublicDirectoryPath, getDocMarkdownOutputPath(doc.path)),
      content: `${doc.source}\n`,
    })),
  ]

  await removeGeneratedDocsStaticAssets()

  for (const file of files) {
    await mkdir(path.dirname(file.filePath), { recursive: true })
    await writeFile(file.filePath, file.content)
  }

  await writeFile(
    docsGeneratedManifestPath,
    JSON.stringify(
      files.map((file) => path.relative(process.cwd(), file.filePath)).sort(),
      null,
      2,
    ),
  )
}

type DocsLlmsSection = {
  docs: Array<{ description: string | undefined; path: string; title: string }>
  title: string
}

type DocsLlmsFullDoc = {
  description: string | undefined
  path: string
  source: string
  title: string
}

export function generateDocsLlmsTxt(props: { sections: Array<DocsLlmsSection> }) {
  const { sections } = props
  const lines = [
    '# curl.md Docs',
    '',
    '> Canonical curl.md documentation for installation, usage, and development.',
    '',
    'Use these pages when you need the current published docs. The links below follow the docs navigation order.',
  ]

  for (const section of sections) {
    lines.push('', `## ${section.title}`, '')

    for (const doc of section.docs)
      lines.push(
        `- [${doc.title}](${doc.path ? `/docs/${doc.path}.md` : '/docs/index.md'}): ${doc.description ?? doc.title}`,
      )
  }

  return `${lines.join('\n')}\n`
}

export function generateDocsLlmsFullTxt(props: { docs: Array<DocsLlmsFullDoc> }) {
  const { docs } = props
  const lines = [
    '# curl.md Docs Full',
    '',
    '> Full markdown export of the canonical curl.md documentation.',
    '',
    'Use this file when you want the entire docs set in a single markdown document.',
  ]

  for (const doc of docs) {
    lines.push('', `## ${doc.path ? `/docs/${doc.path}.md` : '/docs/index.md'}`, '')

    if (doc.description) lines.push(doc.description, '')

    lines.push(doc.source)
  }

  return `${lines.join('\n')}\n`
}

async function removeGeneratedDocsStaticAssets() {
  try {
    const rawManifest = await readFile(docsGeneratedManifestPath, 'utf8')
    const filePaths = JSON.parse(rawManifest) as Array<string>

    for (const filePath of filePaths) await rm(path.join(process.cwd(), filePath), { force: true })
  } catch {}

  await rm(docsGeneratedManifestPath, { force: true })
}

async function readDocsStaticFiles() {
  const filePaths = await findDocsMdxFiles(docsDirectoryPath)
  const docs = await Promise.all(
    filePaths.map(async (filePath) => {
      const source = await readFile(filePath, 'utf8')
      const relativePath = path.relative(docsDirectoryPath, filePath)
      const docPath = getDocPathFromFilePath(relativePath)
      const frontmatter = parseDocsFrontmatter(source)

      return {
        description: getFrontmatterString(frontmatter, 'description'),
        path: docPath,
        source: createDocCopySource(source),
        title: getFrontmatterString(frontmatter, 'title') ?? (docPath || 'index'),
      }
    }),
  )

  return docs.sort((a, b) => a.path.localeCompare(b.path))
}

async function findDocsMdxFiles(directoryPath: string): Promise<Array<string>> {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const filePaths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name)
      if (entry.isDirectory()) return findDocsMdxFiles(entryPath)
      if (entry.isFile() && entry.name.endsWith('.mdx')) return [entryPath]
      return []
    }),
  )

  return filePaths.flat()
}

function getDocPathFromFilePath(filePath: string) {
  const normalizedPath = filePath.replace(/\\/g, '/').replace(/\.mdx$/, '')
  if (normalizedPath === 'index') return ''
  return normalizedPath.replace(/\/index$/, '')
}

function getDocMarkdownOutputPath(docPath: string) {
  if (!docPath) return 'index.md'
  return `${docPath}.md`
}

function parseDocsFrontmatter(source: string) {
  if (!source.startsWith('---\n')) return {}

  const endIndex = source.indexOf('\n---\n', 4)
  if (endIndex === -1) return {}

  try {
    return parseYaml(source.slice(4, endIndex)) as Record<string, unknown>
  } catch {
    return {}
  }
}

function getFrontmatterString(frontmatter: Record<string, unknown>, key: string) {
  const value = frontmatter[key]
  return typeof value === 'string' ? value : undefined
}

function getDocsLlmsSections(
  docsByPath: Map<string, { description: string | undefined; path: string; title: string }>,
) {
  const overviewDocs: Array<DocsLlmsSection['docs'][number]> = []
  const sections: Array<DocsLlmsSection> = []

  for (const item of sidebar) {
    if (item.type === 'link') {
      const doc = docsByPath.get(normalizeSidebarPath(item.path))
      if (doc) overviewDocs.push(doc)
      continue
    }

    const docs = collectSidebarDocs(item.items, docsByPath)
    if (docs.length === 0) continue
    sections.push({ docs, title: item.label })
  }

  if (overviewDocs.length > 0) sections.unshift({ docs: overviewDocs, title: 'Overview' })
  return sections
}

function collectSidebarDocs(
  items: Array<SidebarItem>,
  docsByPath: Map<string, { description: string | undefined; path: string; title: string }>,
) {
  const docs: Array<DocsLlmsSection['docs'][number]> = []

  for (const item of items) {
    if (item.type === 'link') {
      const doc = docsByPath.get(normalizeSidebarPath(item.path))
      if (doc) docs.push(doc)
      continue
    }

    docs.push(...collectSidebarDocs(item.items, docsByPath))
  }

  return docs
}

function normalizeSidebarPath(pathname: string) {
  if (pathname === '/') return ''
  return pathname.replace(/^\//, '')
}

function rewriteGeneratedDocLinks(source: string) {
  return source.replace(
    /\]\((\/docs(?:\/[^)#?]*)?)(\?[^)#]*)?(#[^)]+)?\)/g,
    (_match, pathname, search, hash) => {
      if (pathname === '/docs') return `](/docs/index.md${search ?? ''}${hash ?? ''})`
      if (pathname.endsWith('.md')) return `](${pathname}${search ?? ''}${hash ?? ''})`
      return `](${pathname}.md${search ?? ''}${hash ?? ''})`
    },
  )
}

function isDocsAssetDependency(filePath: string) {
  const normalizedPath = path.resolve(filePath)
  return normalizedPath.startsWith(`${docsDirectoryPath}${path.sep}`)
}

function getFileModifiedAt(filePath: string) {
  try {
    return statSync(filePath).mtime.toISOString()
  } catch {
    return undefined
  }
}

function toEstreeValue(value: string | undefined) {
  if (value === undefined) return { type: 'Identifier', name: 'undefined' }
  return { type: 'Literal', value }
}
