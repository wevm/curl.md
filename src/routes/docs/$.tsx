import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod/v4'
import { findDoc } from './-docs.ts'
import { DocsRouteContent, getDocsHead } from './-route.tsx'

function Component() {
  const navigate = Route.useNavigate()
  const { _splat } = Route.useParams()

  return (
    <DocsRouteContent
      docPath={_splat ?? ''}
      onCodeGroupValueChange={(value, docPath) => {
        navigate({
          params: { _splat: docPath },
          replace: true,
          resetScroll: false,
          search: (search) => ({ ...search, tab: value }),
          to: '/docs/$',
        })
      }}
    />
  )
}

export const Route = createFileRoute('/docs/$')({
  head({ params }) {
    return getDocsHead(params._splat ?? '')
  },
  loader({ params }) {
    if (!findDoc(params._splat ?? '')) throw notFound()
  },
  validateSearch: z.object({
    q: z.string().optional(),
    tab: z.string().optional(),
  }),
  component: Component,
})
