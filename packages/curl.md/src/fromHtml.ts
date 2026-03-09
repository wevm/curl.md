import type { Element, ElementContent, Root } from 'hast'
import rehypeParse from 'rehype-parse'
import rehypeRemark from 'rehype-remark'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import type { VFile } from 'vfile'

export async function fromHtml(
  html: string,
  options?: fromHtml.Options,
): Promise<fromHtml.ReturnType> {
  const file = await unified()
    .use(rehypeParse)
    .use(rehypeExtractMeta, options?.baseUrl)
    .use(rehypeStripNoise, options?.baseUrl)
    .use(rehypeResolveLinks, options?.baseUrl)
    .use(rehypeStripEmpty)
    .use(rehypePreNewlines)
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
    .use(remarkGfm)
    .use(remarkStringify)
    .process(html)

  const meta = filterFrontmatterKeys(
    (file.data.meta as Record<string, string> | undefined) ?? {},
  )

  const relatedLinks =
    (file.data.relatedLinks as Array<{ href: string; text: string }>) ?? []
  let content = String(file)
  if (relatedLinks.length > 0) {
    const links = relatedLinks
      .slice(0, 25)
      .map((l) => `- [${l.text.replace(/[[\]]/g, '\\$&')}](${l.href})`)
      .join('\n')
    content += `\n<!--\nSitemap:\n${links}\n-->\n`
  }

  return { content, meta }
}

export namespace fromHtml {
  export type Options = { baseUrl?: string }
  export type ReturnType = { content: string; meta: Record<string, string> }
}

export function filterFrontmatterKeys(
  meta: Record<string, unknown>,
): Record<string, string> {
  const filtered: Record<string, string> = {}
  const allowedFrontmatterKeys = new Set([
    'author',
    'description',
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

const strippedRoles = new Set([
  'banner',
  'complementary',
  'contentinfo',
  'navigation',
])

// Tags that never contain useful links worth collecting
const noLinkTags = new Set([
  'form',
  'iframe',
  'noscript',
  'script',
  'style',
  'svg',
])

const noiseClassIdTokens = new Set([
  'ad',
  'ads',
  'advert',
  'banner',
  'comment',
  'comments',
  'cookie',
  'menu',
  'modal',
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

type CollectedLink = { href: string; text: string }

function rehypeStripNoise(baseUrl?: string) {
  return (tree: Root, file: VFile) => {
    const links: CollectedLink[] = []
    strip(tree, links, baseUrl)
    if (links.length > 0) file.data.relatedLinks = deduplicateLinks(links)
  }
}

function strip(node: Element | Root, links: CollectedLink[], baseUrl?: string) {
  if (!node.children) return
  node.children = node.children.filter((child) => {
    if (child.type === 'comment') return false
    if (child.type !== 'element') return true

    if (strippedTagNames.has(child.tagName)) {
      if (!noLinkTags.has(child.tagName)) collectLinks(child, links, baseUrl)
      return false
    }

    const role = child.properties?.role as string | undefined
    if (role && strippedRoles.has(role)) {
      collectLinks(child, links, baseUrl)
      return false
    }

    if (isHidden(child)) return false

    if (matchesNoiseClassId(child)) {
      collectLinks(child, links, baseUrl)
      return false
    }

    if (isHighLinkDensity(child)) {
      collectLinks(child, links, baseUrl)
      return false
    }

    strip(child, links, baseUrl)
    return true
  })
}

function isHidden(node: Element): boolean {
  if (node.properties?.hidden != null) return true
  if (
    node.properties?.ariaHidden === 'true' ||
    node.properties?.ariaHidden === true
  )
    return true
  const style = node.properties?.style
  if (
    typeof style === 'string' &&
    /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)
  )
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
    const parts = str.toLowerCase().split(/[^a-z0-9]+/)
    if (parts.some((p) => noiseClassIdTokens.has(p))) return true
  }
  return false
}

function isHighLinkDensity(node: Element): boolean {
  if (!linkDensityBlockTags.has(node.tagName)) return false
  const totalLen = hastToText(node).length
  if (totalLen < 50) return false
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

function collectLinks(node: Element, links: CollectedLink[], baseUrl?: string) {
  if (node.tagName === 'a') {
    const href = node.properties?.href
    if (typeof href !== 'string') return
    if (href.startsWith('#') || href.startsWith('javascript:')) return
    const text = hastToText(node).trim()
    if (text) links.push({ href: resolveUrl(href, baseUrl), text })
    return
  }
  for (const child of node.children)
    if (child.type === 'element') collectLinks(child, links, baseUrl)
}

function deduplicateLinks(links: CollectedLink[]): CollectedLink[] {
  const seen = new Set<string>()
  return links.filter((link) => {
    if (seen.has(link.href)) return false
    seen.add(link.href)
    return true
  })
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
    resolveLinks(tree, baseUrl)
  }
}

function resolveLinks(node: Element | Root, baseUrl: string) {
  if (!('children' in node)) return
  // Unwrap anchor elements with hash-only hrefs (keep children)
  node.children = node.children.flatMap((child) => {
    if (
      child.type === 'element' &&
      child.tagName === 'a' &&
      typeof child.properties?.href === 'string' &&
      child.properties.href.startsWith('#')
    )
      return child.children
    return [child]
  })
  for (const child of node.children) {
    if (child.type !== 'element') continue
    for (const prop of ['href', 'src'] as const) {
      const value = child.properties?.[prop]
      if (typeof value !== 'string') continue
      if (skipPrefixes.some((p) => value.startsWith(p))) continue
      try {
        child.properties[prop] = new URL(value, baseUrl).href
      } catch {}
    }
    resolveLinks(child, baseUrl)
  }
}

// Ensure elements inside <pre> are separated by newlines so
// rehype-remark preserves line breaks in code blocks.
// Also strips trailing <br> inside child elements to avoid
// double newlines (e.g. <div class="cm-line">...<br/></div>).
function rehypePreNewlines() {
  return (tree: Root) => {
    insertPreNewlines(tree)
  }
}

function insertPreNewlines(node: Element | Root) {
  if (!node.children) return
  for (const child of node.children)
    if (child.type === 'element') insertPreNewlines(child)
  if (node.type !== 'element' || node.tagName !== 'pre') return
  stripTrailingBr(node)
  stripInterElementWhitespace(node)
  const updated: typeof node.children = []
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    updated.push(child)
    if (child.type !== 'element') continue
    const next = node.children[i + 1]
    const alreadyHasNewline =
      next?.type === 'text' && next.value.startsWith('\n')
    if (!alreadyHasNewline) updated.push({ type: 'text', value: '\n' })
  }
  node.children = updated
}

const blockTags = new Set(['div', 'p', 'li', 'tr', 'section', 'article'])

// Strip whitespace-only text nodes between block element siblings inside <pre>.
// HTML formatting newlines between <div>s inside <pre><code> cause extra
// blank lines in the output because rehype-remark treats them as content.
function stripInterElementWhitespace(node: Element | Root) {
  if (!('children' in node)) return
  for (const child of node.children)
    if (child.type === 'element') stripInterElementWhitespace(child)
  node.children = node.children.filter((child, i, arr) => {
    if (child.type !== 'text' || child.value.trim() !== '') return true
    const prev = arr[i - 1]
    const next = arr[i + 1]
    const prevBlock = prev?.type === 'element' && blockTags.has(prev.tagName)
    const nextBlock = next?.type === 'element' && blockTags.has(next.tagName)
    return !(prevBlock || nextBlock)
  })
}

function stripTrailingBr(node: Element | Root) {
  if (!('children' in node)) return
  for (const child of node.children) {
    if (child.type !== 'element') continue
    stripTrailingBr(child)
    const last = child.children[child.children.length - 1]
    if (last?.type === 'element' && last.tagName === 'br') child.children.pop()
  }
}

function hastToText(node: Element | ElementContent): string {
  if (node.type === 'text') return node.value
  if (node.type === 'element')
    return node.children.map((c) => hastToText(c)).join('')
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
  for (const child of node.children)
    if (child.type === 'element') stripEmpty(child)
  node.children = node.children.filter((child) => {
    if (child.type !== 'element') return true
    if (!emptyStrippableTags.has(child.tagName)) return true
    if (child.children.length === 0) return false
    return !child.children.every(
      (c) => c.type === 'text' && c.value.trim() === '',
    )
  })
}
