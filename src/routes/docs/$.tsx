import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import * as React from 'react'
import { findDoc } from './-catalog.ts'
import { DocsRouteContent, getDocsHead, validateSearch } from './-route.tsx'
import { Route as DocsLayoutRoute } from './route.tsx'

export const Route = createFileRoute('/docs/$')({
  head({ params }) {
    return getDocsHead(params._splat ?? '')
  },
  loader({ params }) {
    if (!findDoc(params._splat ?? '')) throw notFound({ routeId: '/docs/$' })
  },
  notFoundComponent: NotFoundComponent,
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

function NotFoundComponent() {
  const { login } = DocsLayoutRoute.useLoaderData()

  return (
    <div className="mx-auto w-full max-w-[56rem] px-5 py-8 md:px-12 lg:px-0 lg:pt-12">
      <div className="border-gray-a3 bg-gray-a1/40 max-w-2xl border px-6 py-8">
        <p className="text-gray8 text-xs font-medium tracking-wide uppercase">404</p>
        <h1 className="text-gray10 mt-3 text-2xl font-bold">Page not found</h1>
        <p className="text-gray8 mt-3 max-w-prose text-sm leading-relaxed">
          We couldn't find that docs page.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="bg-gray10 text-bg1 px-3 py-1.5 text-sm hover:opacity-90" to="/docs">
            Back to docs
          </Link>
          <Link
            className="text-gray8 hover:text-gray10 px-3 py-1.5 text-sm"
            to={login ? '/home' : '/'}
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
