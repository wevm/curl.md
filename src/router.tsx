import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const knownRoutes = new Set([
  '',
  'login',
  'new',
  'check',
  'playground',
  'og.png',
  'api',
])

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
        if (firstSegment.includes('.') || knownRoutes.has(firstSegment))
          return url
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
