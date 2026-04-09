import { createFileRoute, notFound } from '@tanstack/react-router'
import { rpc } from '#lib/rpc.ts'
import { DocContent } from './-doc.tsx'
import { findDoc } from './-docs.ts'

export const Route = createFileRoute('/docs/$')({
  head({ params }) {
    const doc = findDoc(params._splat ?? '')
    const ogImage = rpc.api['og.png'].$url({ query: { page: 'index' } }).toString()
    return {
      meta: [
        { title: `${doc?.title ?? 'Docs'} - ${__HOST__}` },
        { name: 'description', content: doc?.description ?? 'URL to markdown for agents' },
        { property: 'og:title', content: `${doc?.title ?? 'Docs'} - ${__HOST__}` },
        { property: 'og:description', content: doc?.description ?? 'URL to markdown for agents' },
        { property: 'og:image', content: ogImage },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: `https://${__HOST__}/docs/${params._splat}` },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: `${doc?.title ?? 'Docs'} - ${__HOST__}` },
        { name: 'twitter:description', content: doc?.description ?? 'URL to markdown for agents' },
        { name: 'twitter:image', content: ogImage },
      ],
    }
  },
  loader({ params }) {
    if (!findDoc(params._splat ?? '')) throw notFound()
  },
  component: Component,
})

function Component() {
  const { _splat } = Route.useParams()
  const doc = findDoc(_splat ?? '')
  if (!doc) return null
  return <DocContent doc={doc} />
}
