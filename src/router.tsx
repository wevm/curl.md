import * as Sentry from '@sentry/react'
import { createRouter } from '@tanstack/react-router'
import { rpc } from '#lib/rpc.ts'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createRouter({
    routeTree,
    context: {},
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
