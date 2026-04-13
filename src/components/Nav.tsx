import { Link } from '@tanstack/react-router'

const skipId = 'main'
const topLinks = [
  { label: 'Guides', to: '/docs' as const },
  { label: 'API', to: '/playground' as const },
  {
    hash: 'cli',
    label: 'CLI',
    params: { _splat: 'getting_started/installation' },
    to: '/docs/$' as const,
  },
] as const

function Group(props: React.PropsWithChildren) {
  return <div className="ms-auto flex items-center gap-1.5">{props.children}</div>
}

function Links() {
  return (
    <div className="ms-10 hidden items-center gap-0.5 md:flex">
      {topLinks.map((link) => (
        <Link
          activeOptions={{ exact: true }}
          activeProps={{ 'data-active': '' }}
          className="text-gray8 hover:text-gray10 data-[active]:text-gray10 px-2 py-1.5 text-sm"
          key={link.label}
          {...('hash' in link ? { hash: link.hash } : {})}
          {...('params' in link ? { params: link.params } : {})}
          to={link.to}
        >
          {link.label}
        </Link>
      ))}
    </div>
  )
}

function Logo(props: { to?: '/' | '/docs' }) {
  return (
    <Link className="font-pixel text-base" to={props.to ?? '/'}>
      curl.md<span className="text-gray8">/&lt;url&gt;</span>
    </Link>
  )
}

function Root(props: React.PropsWithChildren<{ fixed?: boolean }>) {
  return (
    <nav
      className={`flex h-17 items-center px-6 ${props.fixed ? 'bg-bg1 fixed inset-x-0 top-0 z-50' : ''}`}
    >
      {props.children ?? (
        <>
          <Logo />
          <Links />
        </>
      )}
    </nav>
  )
}

function Skip() {
  return (
    <a
      className="bg-gray10 text-bg1 sr-only z-60 text-sm focus:not-sr-only focus:fixed focus:start-6 focus:top-4 focus:block focus:px-3 focus:py-1.5"
      href={`#${skipId}`}
    >
      Skip to content
    </a>
  )
}

export const Nav = {
  Group,
  Links,
  Logo,
  Root,
  Skip,
  skipId,
}
