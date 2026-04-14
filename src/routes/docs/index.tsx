import { createFileRoute, notFound } from '@tanstack/react-router'
import * as React from 'react'
import { findDoc } from './-catalog.ts'
import { DocsRouteContent, getDocsHead, validateSearch } from './-route.tsx'

export const Route = createFileRoute('/docs/')({
  head() {
    return getDocsHead('')
  },
  loader() {
    if (!findDoc('')) throw notFound()
  },
  validateSearch,
  component: Component,
})

function Component() {
  const navigate = Route.useNavigate()
  const handleCodeGroupValueChange = React.useCallback(
    (value: string) => {
      navigate({
        replace: true,
        resetScroll: false,
        search: (search) => ({ ...search, tab: value }),
        to: '/docs',
      })
    },
    [navigate],
  )
  return <DocsRouteContent docPath="" onCodeGroupValueChange={handleCodeGroupValueChange} />
}
