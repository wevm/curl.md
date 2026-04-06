import { createFileRoute } from '@tanstack/react-router'
import { rpc } from '#lib/rpc.ts'

export const Route = createFileRoute('/docs')({
  head() {
    const ogImage = rpc.api['og.png'].$url({ query: { page: 'index' } }).toString()
    return {
      meta: [
        { title: `Docs - ${__HOST__}` },
        { name: 'description', content: 'URL to markdown for agents' },
        { property: 'og:title', content: `${__HOST__}/docs` },
        { property: 'og:description', content: 'URL to markdown for agents' },
        { property: 'og:image', content: ogImage },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: `https://${__HOST__}/docs` },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: `${__HOST__}/docs` },
        { name: 'twitter:description', content: 'URL to markdown for agents' },
        { name: 'twitter:image', content: ogImage },
      ],
    }
  },
  component: Component,
})

function Component() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-6 py-24">
      <h1 className="text-lg font-bold">Docs</h1>
      <p className="text-gray8 mt-2">Coming soon.</p>
    </div>
  )
}
