import { createFileRoute, notFound } from '@tanstack/react-router'
import * as React from 'react'
import { findDoc } from './-docs.ts'
import { DocsRouteContent, getDocsHead, validateSearch } from './-route.tsx'

export const Route = createFileRoute('/docs/$')({
  head({ params }) {
    return getDocsHead(params._splat ?? '')
  },
  loader({ params }) {
    if (!findDoc(params._splat ?? '')) throw notFound()
  },
  validateSearch,
  component: Component,
})

function Component() {
  const navigate = Route.useNavigate()
  const { _splat } = Route.useParams()
  const handleCodeGroupValueChange = React.useCallback(
    (value: string, docPath: string) => {
      navigate({
        params: { _splat: docPath },
        replace: true,
        resetScroll: false,
        search: (search) => ({ ...search, tab: value }),
        to: '/docs/$',
      })
    },
    [navigate],
  )
  return (
    <DocsRouteContent docPath={_splat ?? ''} onCodeGroupValueChange={handleCodeGroupValueChange} />
  )
}
