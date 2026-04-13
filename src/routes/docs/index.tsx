import { createFileRoute, notFound } from '@tanstack/react-router'
import * as React from 'react'
import { z } from 'zod/v4'
import { rpc } from '#lib/rpc.ts'
import { DocContent } from './-doc.tsx'
import { findDoc, findDocPagination } from './-docs.ts'

export const Route = createFileRoute('/docs/')({
  head() {
    const doc = findDoc('')
    const ogImage = rpc.api['og.png'].$url({ query: { page: 'index' } }).toString()
    return {
      meta: [
        { title: `${doc?.title ?? 'Docs'} - ${__HOST__}` },
        { name: 'description', content: doc?.description ?? 'URL to markdown for agents' },
        { property: 'og:title', content: `${__HOST__}/docs` },
        { property: 'og:description', content: doc?.description ?? 'URL to markdown for agents' },
        { property: 'og:image', content: ogImage },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: `https://${__HOST__}/docs` },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: `${__HOST__}/docs` },
        { name: 'twitter:description', content: doc?.description ?? 'URL to markdown for agents' },
        { name: 'twitter:image', content: ogImage },
      ],
    }
  },
  loader() {
    if (!findDoc('')) throw notFound()
  },
  validateSearch: z.object({
    codegroup: z.string().optional(),
    q: z.string().optional(),
  }),
  component: Component,
})

function Component() {
  const navigate = Route.useNavigate()
  const doc = findDoc('')
  if (!doc) return null

  const onCodeGroupValueChange = React.useCallback(
    (value: string) => {
      navigate({
        replace: true,
        resetScroll: false,
        search: (search) => ({ ...search, codegroup: value }),
        to: '/docs',
      })
    },
    [navigate],
  )

  return (
    <DocContent
      doc={doc}
      onCodeGroupValueChange={onCodeGroupValueChange}
      pagination={findDocPagination(doc.path)}
    />
  )
}
