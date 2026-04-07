import * as Sentry from '@sentry/react'
import { createRouteMask, createRouter } from '@tanstack/react-router'
import { rpc } from '#lib/rpc.ts'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createRouter({
    context: {},
    defaultPreloadStaleTime: 0,
    routeMasks: [
      createRouteMask({
        from: '/$login/billing/add_credits/$paymentId',
        params: (prev) => ({ login: prev.login }),
        routeTree,
        to: '/$login/billing',
        unmaskOnReload: true,
      }),
      createRouteMask({
        from: '/$login/billing/add_payment_method',
        params: (prev) => ({ login: prev.login }),
        routeTree,
        to: '/$login/billing',
        unmaskOnReload: true,
      }),
      createRouteMask({
        from: '/$login/billing/remove_payment_method/$paymentMethodId',
        params: (prev) => ({ login: prev.login }),
        routeTree,
        to: '/$login/billing',
        unmaskOnReload: true,
      }),
    ],
    routeTree,
    scrollRestoration: true,
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
