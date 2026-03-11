import * as Sentry from '@sentry/react'
import { createRouter } from '@tanstack/react-router'
import { knownRoutes } from '#lib/routes.ts'
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

  if (!router.isServer) {
    Sentry.init({
      dsn: __SENTRY_DSN__,
      tunnel: '/api/sentry/tunnel',
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
      ],
      environment: __HOST__ === 'curl.md' ? 'production' : 'preview',
      release: __GIT_SHA__,
      replaysOnErrorSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      tracesSampleRate: 0.01,
    })
  }

  return router
}
