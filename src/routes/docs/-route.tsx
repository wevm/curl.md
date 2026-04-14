import * as React from 'react'
import { z } from 'zod/v4'
import { rpc } from '#lib/rpc.ts'
import { findDoc, findDocPagination } from './-catalog.ts'
import { DocContent } from './-render.tsx'

export const validateSearch = z.object({
  q: z.string().optional(),
  tab: z.string().optional(),
})

export function DocsRouteContent(props: {
  docPath: string
  onCodeGroupValueChange: (value: string, docPath: string) => void
}) {
  const { docPath, onCodeGroupValueChange } = props
  const doc = findDoc(docPath)
  if (!doc) return null

  const handleCodeGroupValueChange = React.useCallback(
    (value: string) => {
      onCodeGroupValueChange(value, doc.path)
    },
    [doc.path, onCodeGroupValueChange],
  )

  return (
    <DocContent
      doc={doc}
      onCodeGroupValueChange={handleCodeGroupValueChange}
      pagination={findDocPagination(doc.path)}
    />
  )
}

export function getDocsHead(path: string) {
  const doc = findDoc(path)
  const ogImage = rpc.api['og.png'].$url({ query: { page: 'index' } }).toString()
  const socialTitle = path ? `${doc?.title ?? 'Docs'} - ${__HOST__}` : `${__HOST__}/docs`
  const title = `${doc?.title ?? 'Docs'} - ${__HOST__}`
  const url = `https://${__HOST__}/docs${path ? `/${path}` : ''}`

  return {
    meta: [
      { title },
      { name: 'description', content: doc?.description ?? 'URL to markdown for agents' },
      { property: 'og:title', content: socialTitle },
      { property: 'og:description', content: doc?.description ?? 'URL to markdown for agents' },
      { property: 'og:image', content: ogImage },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: url },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: socialTitle },
      { name: 'twitter:description', content: doc?.description ?? 'URL to markdown for agents' },
      { name: 'twitter:image', content: ogImage },
    ],
  }
}
