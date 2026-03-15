import * as Sentry from '@sentry/react'
import { createRouter } from '@tanstack/react-router'
import { knownRoutes, routes } from '#lib/constants.ts'
import { rpc } from '#lib/rpc.ts'
import type { FileRoutesByTo } from './routeTree.gen'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createRouter({
    routeTree,
    context: {},
    rewrite: {
      input({ url }) {
        if (url.pathname.startsWith('/~dash') || url.pathname.startsWith('/api/')) return url
        const firstSegment = url.pathname.split('/')[1] ?? ''
        if (!firstSegment || knownRoutes.has(firstSegment)) return url
        url.pathname = `/~dash${url.pathname}`
        return url
      },
      output({ url }) {
        if (!url.pathname.startsWith('/~dash')) return undefined
        url.pathname = url.pathname.replace(/^\/~dash/, '') || '/'
        return url
      },
    },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })

  if (!router.isServer)
    Sentry.init({
      dsn: __SENTRY_DSN__,
      tunnel: rpc.api.sentry.tunnel.$url().pathname,
      integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
      environment: __HOST__.split('.').length > 2 ? 'preview' : 'production',
      release: __GIT_SHA__,
      replaysOnErrorSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      tracesSampleRate: 0.01,
    })

  return router
}

type knownRoute = firstPathname<keyof FileRoutesByTo>
type firstPathname<path> = path extends `/${infer segment}`
  ? segment extends `~dash/${string}`
    ? never
    : segment extends `${infer head}/${string}`
      ? head
      : segment
  : never
true satisfies Exclude<knownRoute, (typeof routes)[number]> extends never
  ? true
  : Exclude<knownRoute, (typeof routes)[number]>
