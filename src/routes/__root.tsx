import geistMonoLatin from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { themeScript } from '#lib/theme.ts'
import '../styles.css'

const queryClient = new QueryClient()

export const Route = createRootRoute({
  head: () => ({
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
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootComponent() {
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
      <h1 className="font-bold text-lg">404</h1>
      <p className="mt-2 text-gray9 dark:text-gray6">Page not found</p>
      <Link className="mt-4 hover:underline" to="/">
        Go home
      </Link>
    </div>
  )
}

function RootDocument(props: React.PropsWithChildren) {
  const { children } = props
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: theme script is static
          dangerouslySetInnerHTML={{ __html: themeScript }}
          suppressHydrationWarning
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
