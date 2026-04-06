import { Link } from '@tanstack/react-router'

const skipId = 'main'

function Group(props: React.PropsWithChildren) {
  return <div className="ms-auto flex items-center gap-1.5">{props.children}</div>
}

function Logo() {
  return (
    <Link className="font-pixel text-base" to="/">
      curl.md<span className="text-gray8">/&lt;url&gt;</span>
    </Link>
  )
}

function Root(props: React.PropsWithChildren<{ fixed?: boolean }>) {
  return (
    <nav
      className={`flex h-17 items-center px-6 ${props.fixed ? 'bg-bg1 fixed inset-x-0 top-0 z-50' : ''}`}
    >
      {props.children ?? <Logo />}
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
  Logo,
  Root,
  Skip,
  skipId,
}
