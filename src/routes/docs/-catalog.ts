import { sidebar, type SidebarItem } from '#docs/_sidebar.ts'
import { createDocsSearch, type DocSearchResult } from './-search.ts'
import {
  createDocCopySource,
  getDocHeadings,
  type Doc,
  type DocPagination,
  type Heading,
} from './-utils.ts'

type DocModule = {
  default: React.ComponentType<{ components?: Record<string, React.ComponentType> }>
  frontmatter?: { description?: string; title?: string }
  headings?: Array<Heading>
  lastUpdated?: string
}

const modules = import.meta.glob<DocModule>('../../../docs/**/*.mdx', { eager: true })
const sources = import.meta.glob<unknown>('../../../docs/**/*.mdx', {
  eager: true,
  query: '?raw',
})

const allDocs: Array<Doc> = Object.entries(modules).map(([filePath, mod]) => {
  const path = filePath
    .replace('../../../docs/', '')
    .replace(/\.mdx$/, '')
    .replace(/\/index$/, '')
  const rawSource = sources[filePath] ?? ''

  return {
    Component: mod.default,
    description: mod.frontmatter?.description,
    headings: getDocHeadings(rawSource, mod.headings ?? []),
    ...(mod.lastUpdated ? { lastUpdated: mod.lastUpdated } : {}),
    path: path === 'index' ? '' : path,
    source: createDocCopySource(rawSource),
    sourcePath: filePath.replace('../../../', ''),
    title: mod.frontmatter?.title ?? path,
  }
})

export function findDoc(path: string): Doc | undefined {
  return allDocs.find((d) => d.path === path)
}

export function findDocPagination(path: string): DocPagination {
  const index = orderedDocs.findIndex((doc) => doc.path === path)
  if (index === -1) return { next: undefined, previous: undefined }
  return {
    next: orderedDocs[index + 1],
    previous: orderedDocs[index - 1],
  }
}

export function searchDocs(query: string): Array<DocSearchResult> {
  return docsSearch.search(query)
}

const orderedDocs = flattenSidebarItems(sidebar)
  .map((item) => findDoc(item.path === '/' ? '' : item.path.replace(/^\//, '')))
  .filter((doc): doc is Doc => doc !== undefined)

const docsSearch = createDocsSearch(
  allDocs,
  orderedDocs.map((doc) => doc.path),
)

function flattenSidebarItems(
  items: Array<SidebarItem>,
): Array<Extract<SidebarItem, { type: 'link' }>> {
  const links: Array<Extract<SidebarItem, { type: 'link' }>> = []

  for (const item of items) {
    if (item.type === 'link') links.push(item)
    else links.push(...flattenSidebarItems(item.items))
  }

  return links
}
