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
          url.pathname.startsWith('/~org') ||
          url.pathname.startsWith('/api/')
        )
          return url
        const firstSegment = url.pathname.split('/')[1] ?? ''
        if (!firstSegment || knownRoutes.has(firstSegment)) return url
        url.pathname = `/~org${url.pathname}`
        return url
      },
      output: ({ url }) => {
        if (!url.pathname.startsWith('/~org')) return undefined
        url.pathname = url.pathname.replace(/^\/~org/, '') || '/'
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
  'new',
  'playground',
])
type KnownRoute = ExtractFirstSegment<keyof FileRoutesByTo>
type ExtractFirstSegment<T> = T extends `/${infer S}`
  ? S extends `~org/${string}`
    ? never
    : S extends `${infer First}/${string}`
      ? First
      : S
  : never
