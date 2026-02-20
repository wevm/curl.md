import geistMonoLatin from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url'
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { themeScript, useTheme } from '#lib/theme.ts'
import '../styles.css'

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
        content: 'width=device-width, initial-scale=1',
      },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
})

function RootComponent() {
  const { theme, mounted, cycle } = useTheme()
  return (
    <>
      <div className="mx-auto max-w-xl px-4 py-16 font-mono text-sm">
        <Outlet />
      </div>
      <div className="end-4 bottom-4 flex gap-2 text-xs text-gray5 max-sm:mx-auto max-sm:justify-center max-sm:py-8 sm:fixed">
        {mounted && (
          <button
            className="cursor-pointer hover:text-gray10"
            onClick={cycle}
            type="button"
          >
            {theme}
          </button>
        )}
        {prNumber(__HOST__) && (
          <a
            className="hover:text-gray10"
            href={`https://github.com/wevm/curl.md/pull/${prNumber(__HOST__)}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            #{prNumber(__HOST__)}
          </a>
        )}
        <a
          className="hover:text-gray10"
          href={commitHref(__GIT_SHA__)}
          rel="noopener noreferrer"
          target="_blank"
        >
          {__GIT_SHA__.slice(0, 7)}
        </a>
      </div>
    </>
  )
}

function commitHref(sha: string) {
  if (sha === 'dev') return 'https://github.com/wevm/curl.md'
  const pr = prNumber(__HOST__)
  if (pr) return `https://github.com/wevm/curl.md/pull/${pr}/commits/${sha}`
  return `https://github.com/wevm/curl.md/commit/${sha}`
}

function prNumber(host: string) {
  return host.match(/^pr(\d+)\./)?.[1]
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
