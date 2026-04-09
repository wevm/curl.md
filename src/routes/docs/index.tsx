import { createFileRoute, notFound } from '@tanstack/react-router'
import { rpc } from '#lib/rpc.ts'
import { DocContent } from './-doc.tsx'
import { findDoc } from './-docs.ts'

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
  component: Component,
})

function Component() {
  const doc = findDoc('')
  if (!doc) return null
  return <DocContent doc={doc} />
}
