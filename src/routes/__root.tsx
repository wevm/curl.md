import geistMonoLatin from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'
import * as React from 'react'
import { themeScript, useTheme } from '#hooks/useTheme.ts'
import '../styles.css'

export const Route = createRootRoute({
  head() {
    return {
      links: [
        {
          as: 'font',
          crossOrigin: 'anonymous',
          href: geistMonoLatin,
          rel: 'preload',
          type: 'font/woff2',
        },
        { href: '/favicon.svg', rel: 'icon', type: 'image/svg+xml' },
      ],
      meta: [
        { charSet: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, maximum-scale=1',
        },
      ],
      scripts: [
        {
          src: 'https://cdn.usefathom.com/script.js',
          'data-site': 'GPMOZIWR',
          defer: true,
        },
      ],
    }
  },
  component: RootComponent,
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootComponent() {
  const [queryClient] = React.useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <div className="font-mono text-sm">
        <Outlet />
      </div>
    </QueryClientProvider>
  )
}

function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <h1 className="text-lg font-bold">404</h1>
      <p className="text-gray9 dark:text-gray6 mt-2">Page not found</p>
      <Link className="mt-4 hover:underline" to="/">
        Go home
      </Link>
    </div>
  )
}

function RootDocument(props: React.PropsWithChildren) {
  const { children } = props
  const { resolvedTheme } = useTheme()
  return (
    <html lang="en" data-theme={resolvedTheme} suppressHydrationWarning>
      <head>
        <script
          // oxlint-disable-next-line react/no-danger: theme script is static
          dangerouslySetInnerHTML={{ __html: themeScript }}
          suppressHydrationWarning
        />
        <script
          // oxlint-disable-next-line react/no-danger: reload script is static
          dangerouslySetInnerHTML={{ __html: maskedRouteReloadScript }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

const maskedRouteReloadScript = `
(() => {
  const billingDialogPath = new RegExp(
    '^/[^/]+/billing/(add_payment_method|add_credits/[^/]+|remove_payment_method/[^/]+)$',
  )
  const tempLocation = window.history.state?.__tempLocation
  if (!tempLocation?.pathname) return
  if (
    tempLocation.pathname === window.location.pathname &&
    (tempLocation.search ?? '') === window.location.search &&
    (tempLocation.hash ?? '') === window.location.hash
  ) return
  if (!billingDialogPath.test(tempLocation.pathname))
    return
  window.location.replace(
    tempLocation.pathname + (tempLocation.search ?? '') + (tempLocation.hash ?? ''),
  )
})()
`
