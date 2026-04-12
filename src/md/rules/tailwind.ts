import type { Element, ElementContent, Root } from 'hast'
import rehypeParse from 'rehype-parse'
import { unified } from 'unified'
import { fromHtml } from '../fromHtml.ts'
import { defineRule } from '../mod.ts'

export const tailwind = defineRule({
  key: 'tailwind',
  patterns: [new URLPattern({ hostname: 'tailwindcss.com' })],
  checks: [
    {
      url: 'https://tailwindcss.com/docs/installation/using-vite',
      title: 'Installing Tailwind CSS with Vite',
      contains: ['Create your project'],
      minLength: 500,
    },
    {
      url: 'https://tailwindcss.com/docs/padding',
      title: 'padding',
      contains: ['padding'],
      minLength: 500,
    },
  ],
  async extract(response) {
    let html = await response.text()

    // Unhide overflow rows in ApiTable (hidden="" or hidden="until-found" tbody)
    html = html.replace(/(<tbody\b[^>]*?)\s+hidden(?:="[^"]*")?/g, '$1')

    // Strip "Show more" / "Show less" toggle buttons in ApiTable
    html = html.replace(/<button\b[^>]*>(?:Show more|Show less)<\/button>/g, '')

    html = isolateDataContent(html)

    return fromHtml(html, { baseUrl: response.url })
  },
})

function isolateDataContent(html: string): string {
  const tree = unified().use(rehypeParse).parse(html) as Root
  const htmlNode = tree.children.find(
    (node): node is Element => node.type === 'element' && node.tagName === 'html',
  )
  const head = htmlNode?.children.find(
    (node): node is Element => node.type === 'element' && node.tagName === 'head',
  )
  const body = htmlNode?.children.find(
    (node): node is Element => node.type === 'element' && node.tagName === 'body',
  )
  if (!body) return html

  const content = collectContentRoots(body)
  if (content.length === 0) return html

  return `<html>${head ? toHtml(head) : ''}<body>${content.map(toHtml).join('')}</body></html>`
}

function collectContentRoots(body: Element): Element[] {
  const dataContentNodes = collectDataContent(body)
  if (dataContentNodes.length === 0) return []

  const roots = new Set<Element>()
  for (const node of dataContentNodes) {
    roots.add(findContentRoot(body, node) ?? node)
  }
  return [...roots].filter(
    (root) => ![...roots].some((other) => other !== root && containsElement(root, other)),
  )
}

function collectDataContent(node: Element | Root): Element[] {
  const content: Element[] = []
  for (const child of node.children ?? []) {
    if (child.type !== 'element') continue
    if (child.properties.dataContent === 'true' || child.properties.dataContent === true) {
      content.push(child)
      continue
    }
    content.push(...collectDataContent(child))
  }
  return content
}

function findContentRoot(root: Element, target: Element): Element | undefined {
  const path = findPath(root, target)
  if (!path) return

  let candidate: Element | undefined
  for (const node of path.slice(0, -1).reverse()) {
    if (hasIntroMarkers(node)) {
      candidate = node
      break
    }
  }
  return candidate
}

function findPath(root: Element, target: Element): Element[] | undefined {
  if (root === target) return [root]
  for (const child of root.children ?? []) {
    if (child.type !== 'element') continue
    const path = findPath(child, target)
    if (path) return [root, ...path]
  }
}

function containsElement(root: Element, target: Element): boolean {
  if (root === target) return true
  for (const child of root.children ?? []) {
    if (child.type !== 'element') continue
    if (containsElement(child, target)) return true
  }
  return false
}

function hasIntroMarkers(node: Element): boolean {
  return hasMarker(node, 'dataSection') || hasMarker(node, 'dataDescription')
}

function hasMarker(node: Element, key: 'dataDescription' | 'dataSection'): boolean {
  if (node.properties[key] === 'true' || node.properties[key] === true) return true
  for (const child of node.children ?? []) {
    if (child.type !== 'element') continue
    if (hasMarker(child, key)) return true
  }
  return false
}

function toHtml(node: ElementContent): string {
  if (node.type === 'text') return escapeHtml(node.value)
  if (node.type === 'comment') return `<!--${node.value}-->`
  if (node.type !== 'element') return ''

  const attributes = Object.entries(node.properties ?? {})
    .flatMap(([key, value]) => {
      if (value == null || value === false) return []
      const attr = key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
      if (value === true) return [attr]
      if (Array.isArray(value)) return [`${attr}="${escapeHtml(value.join(' '))}"`]
      return [`${attr}="${escapeHtml(String(value))}"`]
    })
    .join(' ')
  const open = attributes ? `<${node.tagName} ${attributes}>` : `<${node.tagName}>`
  return `${open}${node.children.map(toHtml).join('')}</${node.tagName}>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
