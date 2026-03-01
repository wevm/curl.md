import { createRouter } from '@tanstack/react-router'
import type { FileRoutesByTo } from './routeTree.gen'
import { routeTree } from './routeTree.gen'

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    rewrite: {
      input: ({ url }) => {
        if (
          url.pathname.startsWith('/~dash') ||
          url.pathname.startsWith('/api/')
        )
          return url
        const firstSegment = url.pathname.split('/')[1] ?? ''
        if (!firstSegment || knownRoutes.has(firstSegment)) return url
        url.pathname = `/~dash${url.pathname}`
        return url
      },
      output: ({ url }) => {
        if (!url.pathname.startsWith('/~dash')) return undefined
        url.pathname = url.pathname.replace(/^\/~dash/, '') || '/'
        return url
      },
    },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })
  return router
}

const knownRoutes: Set<string> = new Set<KnownRoute>([
  '',
  'auth',
  'check',
  'login',
  'playground',
])
type KnownRoute = ExtractFirstSegment<keyof FileRoutesByTo>
type ExtractFirstSegment<path> = path extends `/${infer segment}`
  ? segment extends `~dash/${string}`
    ? never
    : segment extends `${infer head}/${string}`
      ? head
      : segment
  : never
