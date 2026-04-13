import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod/v4'
import { findDoc } from './-docs.ts'
import { DocsRouteContent, getDocsHead } from './-route.tsx'

function Component() {
  const navigate = Route.useNavigate()

  return (
    <DocsRouteContent
      docPath=""
      onCodeGroupValueChange={(value) => {
        navigate({
          replace: true,
          resetScroll: false,
          search: (search) => ({ ...search, tab: value }),
          to: '/docs',
        })
      }}
    />
  )
}

export const Route = createFileRoute('/docs/')({
  head() {
    return getDocsHead('')
  },
  loader() {
    if (!findDoc('')) throw notFound()
  },
  validateSearch: z.object({
    q: z.string().optional(),
    tab: z.string().optional(),
  }),
  component: Component,
})
