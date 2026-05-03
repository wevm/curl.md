import type { Element, ElementContent, Root } from 'hast'
import rehypeParse from 'rehype-parse'
import rehypeRemark from 'rehype-remark'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import type { VFile } from 'vfile'
import type { Profile } from './mod.ts'

export async function fromHtml(
  html: string,
  options?: fromHtml.Options,
): Promise<fromHtml.ReturnType> {
  const file = await unified()
    .use(rehypeParse)
    .use(rehypeExtractMeta, options?.baseUrl)
    .use(rehypeStripNoise, options?.profile)
    .use(rehypeResolveLinks, options?.baseUrl)
    .use(rehypeNormalizePreCode)
    .use(rehypeStripEmpty)
    .use(rehypeRemark, {
      handlers: {
        mark(state, node) {
          const result = {
            type: 'html' as const,
            value: `<mark>${hastToText(node)}</mark>`,
          }
          state.patch(node, result)
          return result
        },
      },
    })
    .use(remarkGfm, { tablePipeAlign: false })
    .use(remarkStringify)
    .process(html)

  const meta = filterFrontmatterKeys((file.data.meta as Record<string, string> | undefined) ?? {})
  const content = String(file)

  return { content, meta }
}

export namespace fromHtml {
  export type Options = { baseUrl?: string; profile?: Profile<Record<string, unknown>> | undefined }
  export type ReturnType = { content: string; meta: Record<string, string> }
}

export function filterFrontmatterKeys(meta: Record<string, unknown>): Record<string, string> {
  const filtered: Record<string, string> = {}
  const allowedFrontmatterKeys = new Set([
    'author',
    'description',
    'generator',
    'publish_date',
    'site',
    'title',
    'url',
  ])
  for (const [k, v] of Object.entries(meta)) {
    if (!allowedFrontmatterKeys.has(k)) continue
    if (typeof v === 'string') filtered[k] = v.trim()
  }
  return filtered
}

const metaPropertyMap: Record<string, string> = {
  'article:published_time': 'publish_date',
  author: 'author',
  date: 'publish_date',
  description: 'description',
  generator: 'generator',
  'og:description': 'description',
  'og:site_name': 'site',
  pubdate: 'publish_date',
}

function rehypeExtractMeta(baseUrl?: string) {
  return (tree: Root, file: VFile) => {
    const html = tree.children.find(
      (n): n is Element => n.type === 'element' && n.tagName === 'html',
    )
    const head = html?.children.find(
      (n): n is Element => n.type === 'element' && n.tagName === 'head',
    )
    if (!head) return

    const meta: Record<string, string> = {}
    for (const node of head.children) {
      if (node.type !== 'element') continue
      if (node.tagName === 'title') {
        const text = node.children.find((c) => c.type === 'text')
        if (text?.type === 'text') meta.title = text.value
      }
      if (node.tagName === 'meta') {
        const key =
          (node.properties.name as string | undefined) ??
          (node.properties.property as string | undefined)
        const content = node.properties.content as string | undefined
        if (!key || !content) continue
        const frontmatterKey = metaPropertyMap[key]
        if (frontmatterKey) meta[frontmatterKey] ??= content
      }
      if (
        node.tagName === 'link' &&
        (node.properties.rel as string[] | undefined)?.includes('canonical')
      )
        meta.url = resolveUrl(node.properties.href as string, baseUrl)
    }

    if (Object.keys(meta).length > 0) file.data.meta = meta
  }
}

const strippedTagNames = new Set([
  'aside',
  'footer',
  'form',
  'iframe',
  'nav',
  'noscript',
  'script',
  'style',
  'svg',
])

const strippedRoles = new Set(['banner', 'complementary', 'contentinfo', 'navigation'])

const noiseClassIdTokens = new Set([
  'ad',
  'ads',
  'advert',
  'banner',
  'comment',
  'comments',
  'cookie',
  'footer',
  'menu',
  'modal',
  'navbar',
  'newsletter',
  'popup',
  'promo',
  'related',
  'share',
  'sharing',
  'sidebar',
  'social',
  'sponsor',
  'widget',
])

const linkDensityBlockTags = new Set(['div', 'ol', 'section', 'ul'])

function rehypeStripNoise(profile?: Profile<Record<string, unknown>>) {
  return (tree: Root) => {
    strip(tree, false, profile)
  }
}

const sectioningTags = new Set(['article', 'main', 'section'])

function strip(
  node: Element | Root,
  inSectioning = false,
  profile?: Profile<Record<string, unknown>>,
) {
  if (!node.children) return
  node.children = node.children.filter((child) => {
    if (child.type === 'comment') return false
    if (child.type !== 'element') return true
    const knownContentRoot = isKnownContentRoot(child, profile)

    if (strippedTagNames.has(child.tagName)) return false

    // <header> has implicit role="banner" only outside sectioning content
    if (child.tagName === 'header' && !inSectioning) return false

    const role = child.properties?.role as string | undefined
    if (role && strippedRoles.has(role)) return false

    if (isHidden(child)) return false
    if (isDecorativeHashLink(child)) return false
    if (isSkipLink(child)) return false
    if (!knownContentRoot && !containsContentContainer(child) && matchesNoiseClassId(child))
      return false
    if (!knownContentRoot && isHighLinkDensity(child)) return false

    strip(child, inSectioning || sectioningTags.has(child.tagName), profile)
    return true
  })
}

function containsContentContainer(node: Element): boolean {
  return (
    node.tagName === 'article' || node.tagName === 'main' || hasDescendantContentContainer(node)
  )
}

function isKnownContentRoot(node: Element, profile?: Profile<Record<string, unknown>>): boolean {
  if (!profile) return false
  return profile.contentRootSelectors.some((selector) => matchesSelector(node, selector))
}

function matchesSelector(node: Element, selector: string): boolean {
  if (selector.startsWith('#')) return node.properties?.id === selector.slice(1)
  if (!selector.startsWith('.')) return false
  const className = node.properties?.className
  const classes = Array.isArray(className)
    ? className.map(String)
    : typeof className === 'string'
      ? className.split(/\s+/).filter(Boolean)
      : []
  return classes.includes(selector.slice(1))
}

function isSkipLink(node: Element): boolean {
  if (node.tagName !== 'a') return false
  const href = node.properties?.href
  if (typeof href !== 'string' || !href.startsWith('#')) return false
  const text = hastToText(node).toLowerCase()
  return text.includes('skip')
}

function isDecorativeHashLink(node: Element): boolean {
  if (node.tagName !== 'a') return false
  const href = node.properties?.href
  if (typeof href !== 'string' || !href.startsWith('#')) return false

  const className = node.properties?.className
  const classes = Array.isArray(className)
    ? className.map((value) => String(value).toLowerCase())
    : typeof className === 'string'
      ? className.toLowerCase().split(/\s+/).filter(Boolean)
      : []
  if (classes.includes('headerlink') || classes.includes('hash-link')) return true

  const labels = [node.properties?.title, node.properties?.ariaLabel]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase())
  if (
    labels.some(
      (label) =>
        label.includes('permanent link') ||
        label.includes('direct link') ||
        label.includes('link to this heading') ||
        label.includes('link to this definition'),
    )
  )
    return true

  const text = hastToText(node).trim()
  return text !== '' && /^[¶#§\u200b]+$/u.test(text)
}

function isHidden(node: Element): boolean {
  if (node.properties?.hidden != null) return true
  if (node.properties?.ariaHidden === 'true' || node.properties?.ariaHidden === true) return true
  const style = node.properties?.style
  if (typeof style === 'string' && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style))
    return true
  return false
}

function matchesNoiseClassId(node: Element): boolean {
  const classes = node.properties?.className as string[] | undefined
  const id = node.properties?.id as string | undefined
  for (const value of [...(classes ?? []), ...(id ? [id] : [])]) {
    const str = String(value)
    // Skip Tailwind utility classes / CSS custom properties that contain
    // noise-like substrings (e.g. `md:[--fd-sidebar-width:268px]`)
    if (/[[\]():]|^--/.test(str)) continue
    if (/^(has|is)-/.test(str)) continue
    const parts = str.toLowerCase().split(/[^a-z0-9]+/)
    if (parts.some((p) => noiseClassIdTokens.has(p))) return true
  }
  return false
}

function isHighLinkDensity(node: Element): boolean {
  if (!linkDensityBlockTags.has(node.tagName)) return false
  const totalLen = hastToText(node).length
  if (totalLen < 50) return false
  if (hasDescendantContentContainer(node)) return false
  return getLinkTextLength(node) / totalLen > 0.5
}

function getLinkTextLength(node: Element): number {
  let length = 0
  for (const child of node.children) {
    if (child.type !== 'element') continue
    if (child.tagName === 'a') length += hastToText(child).length
    else length += getLinkTextLength(child)
  }
  return length
}

function hasDescendantContentContainer(node: Element): boolean {
  for (const child of node.children) {
    if (child.type !== 'element') continue
    if (child.tagName === 'article' || child.tagName === 'main') return true
    if (hasDescendantContentContainer(child)) return true
  }
  return false
}

const skipPrefixes = ['http://', 'https://', '//', '#', 'mailto:', 'tel:']

function resolveUrl(url: string, baseUrl?: string): string {
  if (!baseUrl) return url
  try {
    return new URL(url, baseUrl).href
  } catch {
    return url
  }
}

function rehypeResolveLinks(baseUrl?: string) {
  return (tree: Root) => {
    if (!baseUrl) return
    let baseOrigin: string | undefined
    try {
      baseOrigin = new URL(baseUrl).origin
    } catch {}
    resolveLinks(tree, baseUrl, baseOrigin)
  }
}

function resolveLinks(node: Element | Root, baseUrl: string, baseOrigin?: string) {
  if (!('children' in node)) return
  // Unwrap anchor elements with hash-only or missing hrefs (keep children)
  // Strip <base> elements so rehype-remark doesn't pick up a relativized href
  node.children = node.children.flatMap((child) => {
    if (child.type === 'element' && child.tagName === 'base') return []
    if (child.type === 'element' && child.tagName === 'a') {
      const href = child.properties?.href
      if (typeof href !== 'string' || href.startsWith('#')) return child.children
    }
    return [child]
  })
  for (const child of node.children) {
    if (child.type !== 'element') continue
    for (const prop of ['href', 'src'] as const) {
      const value = child.properties?.[prop]
      if (typeof value !== 'string') continue
      if (skipPrefixes.some((p) => value.startsWith(p))) {
        // Relativize same-origin absolute URLs
        if (baseOrigin && value.startsWith(baseOrigin)) {
          child.properties[prop] = value.slice(baseOrigin.length) || '/'
        }
        continue
      }
      try {
        const resolved = new URL(value, baseUrl).href
        child.properties[prop] =
          baseOrigin && resolved.startsWith(baseOrigin)
            ? resolved.slice(baseOrigin.length) || '/'
            : resolved
      } catch {}
    }
    resolveLinks(child, baseUrl, baseOrigin)
  }
}

// Flatten syntax-highlighted HTML inside <pre> to plain text so rehype-remark
// emits a single code block instead of splitting every token span onto a line.
function rehypeNormalizePreCode() {
  return (tree: Root) => {
    normalizePreCode(tree)
  }
}

function normalizePreCode(node: Element | Root) {
  if (!node.children) return
  for (const child of node.children) if (child.type === 'element') normalizePreCode(child)
  if (node.type !== 'element' || node.tagName !== 'pre') return

  const code = node.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'code',
  )
  const text = normalizePreText(code ?? node).replace(/\n+$/, '')
  node.children = [
    code
      ? { ...code, children: [{ type: 'text', value: text }] }
      : {
          type: 'element',
          tagName: 'code',
          properties: {},
          children: [{ type: 'text', value: text }],
        },
  ]
}

const preLineContainerTags = new Set(['article', 'div', 'li', 'p', 'section', 'tr'])

function normalizePreText(node: Element | ElementContent): string {
  if (node.type === 'text') return node.value
  if (node.type !== 'element') return ''
  if (node.tagName === 'br') return '\n'

  const text = node.children
    .flatMap((child, index, children) =>
      child.type === 'text' && shouldIgnorePreWhitespace(child, index, children)
        ? []
        : [normalizePreText(child)],
    )
    .join('')
  if (!preLineContainerTags.has(node.tagName) || text.endsWith('\n')) return text
  return `${text}\n`
}

function shouldIgnorePreWhitespace(
  node: Extract<ElementContent, { type: 'text' }>,
  index: number,
  siblings: ElementContent[],
): boolean {
  if (node.value.trim() !== '') return false
  const prev = siblings[index - 1]
  const next = siblings[index + 1]
  const prevBlock = prev?.type === 'element' && preLineContainerTags.has(prev.tagName)
  const nextBlock = next?.type === 'element' && preLineContainerTags.has(next.tagName)
  return prevBlock || nextBlock
}

function hastToText(node: Element | ElementContent): string {
  if (node.type === 'text') return node.value
  if (node.type === 'element') return node.children.map((c) => hastToText(c)).join('')
  return ''
}

const emptyStrippableTags = new Set([
  'article',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'main',
  'ol',
  'p',
  'section',
  'span',
  'ul',
])

function rehypeStripEmpty() {
  return (tree: Root) => {
    stripEmpty(tree)
  }
}

function stripEmpty(node: Element | Root) {
  if (!node.children) return
  for (const child of node.children) if (child.type === 'element') stripEmpty(child)
  node.children = node.children.filter((child) => {
    if (child.type !== 'element') return true
    if (!emptyStrippableTags.has(child.tagName)) return true
    if (child.children.length === 0) return false
    return !child.children.every((c) => c.type === 'text' && c.value.trim() === '')
  })
}
