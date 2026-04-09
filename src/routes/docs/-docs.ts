type Heading = { id: string; level: number; text: string }

type DocModule = {
  default: React.ComponentType<{ components?: Record<string, React.ComponentType> }>
  frontmatter?: { description?: string; title?: string }
  headings?: Array<Heading>
}

const modules = import.meta.glob<DocModule>('../../../docs/**/*.mdx', { eager: true })

export type Doc = {
  Component: React.ComponentType<{ components?: Record<string, React.ComponentType> }>
  description: string | undefined
  headings: Array<Heading>
  path: string
  title: string
}

export const allDocs: Array<Doc> = Object.entries(modules).map(([filePath, mod]) => {
  const path = filePath
    .replace('../../../docs/', '')
    .replace(/\.mdx$/, '')
    .replace(/\/index$/, '')
  return {
    Component: mod.default,
    description: mod.frontmatter?.description,
    headings: mod.headings ?? [],
    path: path === 'index' ? '' : path,
    title: mod.frontmatter?.title ?? path,
  }
})

export function findDoc(path: string) {
  return allDocs.find((d) => d.path === path)
}
