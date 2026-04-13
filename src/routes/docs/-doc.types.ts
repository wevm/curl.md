import type { ComponentType } from 'react'

export type Heading = { id: string; level: number; text: string }

export type Doc = {
  Component: ComponentType<{ components?: Record<string, ComponentType> }>
  description: string | undefined
  headings: Array<Heading>
  lastUpdated?: string
  path: string
  source: string
  sourcePath: string
  title: string
}

export type DocPagination = {
  next: Pick<Doc, 'path' | 'title'> | undefined
  previous: Pick<Doc, 'path' | 'title'> | undefined
}
