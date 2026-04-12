import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { Nav } from '#components/Nav.tsx'
import { useTheme } from '#hooks/useTheme.ts'
import { getSessionLogin } from '#server/session.ts'
import { sidebar, type SidebarItem } from '../../../docs/_sidebar.ts'

export const Route = createFileRoute('/docs')({
  async loader({ location }) {
    return {
      login: await getSessionLogin(),
      next: location.publicHref ?? location.pathname,
    }
  },
  component: Component,
})

function Component() {
  const { login, next } = Route.useLoaderData()
  const [open, setOpen] = React.useState(false)
  const currentYear = new Date().getFullYear()

  return (
    <div className="relative flex min-h-dvh flex-col">
      <Nav.Skip />

      <nav className="bg-bg1 border-gray-a3 fixed inset-x-0 top-0 z-50 h-17 border-b">
        <div className="mx-auto flex h-full w-full max-w-[90rem] items-center px-6">
          <Nav.Logo />
          <Nav.Group>
            <a
              aria-label="GitHub"
              className="text-gray8 hover:text-gray10 p-1.5"
              href="https://github.com/wevm/curl.md"
              rel="noopener noreferrer"
              target="_blank"
            >
              <IconOcticonMarkGithub16 className="size-[1.125rem]" />
            </a>
            <a
              aria-label="X"
              className="text-gray8 hover:text-gray10 me-2 p-1.5"
              href="https://x.com/wevm_dev"
              rel="noopener noreferrer"
              target="_blank"
            >
              <IconSimpleIconsX className="size-4.5" />
            </a>
            {login ? (
              <Link
                className="bg-gray10 text-bg1 px-3 py-1.5 text-sm"
                params={{ login }}
                to="/$login"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                className="bg-gray10 text-bg1 px-3 py-1.5 text-sm"
                search={{ next }}
                to="/login"
              >
                Sign in
              </Link>
            )}
            <button
              className="hover:bg-gray-a2 p-1.5 md:hidden"
              onClick={() => setOpen((o) => !o)}
              type="button"
            >
              {open ? (
                <IconOcticonX16 className="size-4" />
              ) : (
                <IconOcticonThreeBars16 className="size-4" />
              )}
            </button>
          </Nav.Group>
        </div>
      </nav>

      <div className="mt-17 flex flex-1 justify-center">
        <div className="flex w-full max-w-[90rem] md:gap-12">
          <aside
            className="bg-bg1 border-gray-a3 fixed top-17 bottom-0 z-40 hidden w-64 border-e data-[open]:block md:static md:block md:shrink-0"
            data-open={open ? '' : undefined}
          >
            <div className="h-full overflow-y-auto py-6 ps-6 pe-6 md:sticky md:top-17 md:h-[calc(100dvh-4.25rem)]">
              <SidebarNav items={sidebar} onNavigate={() => setOpen(false)} />
            </div>
          </aside>

          <main className="min-w-0 flex-1" id={Nav.skipId}>
            <Outlet />
          </main>
        </div>
      </div>

      <footer className="border-gray-a3 border-t px-6">
        <div className="mx-auto w-full max-w-[90rem] py-4">
          <div className="text-gray8 flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between">
            <p>Copyright curl.md {currentYear}. MIT licensed.</p>

            <div className="flex items-center gap-3">
              <Link className="hover:text-gray10" to="/">
                Home
              </Link>
              <a
                aria-label="GitHub"
                className="hover:text-gray10 p-1"
                href="https://github.com/wevm/curl.md"
                rel="noopener noreferrer"
                target="_blank"
              >
                <IconOcticonMarkGithub16 className="size-4" />
              </a>
              <a
                aria-label="X"
                className="hover:text-gray10 p-1"
                href="https://x.com/wevm_dev"
                rel="noopener noreferrer"
                target="_blank"
              >
                <IconSimpleIconsX className="size-4" />
              </a>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

function ThemeToggle() {
  const { setTheme, theme } = useTheme()

  return (
    <div className="border-gray-a3 flex items-center border p-1">
      <button
        aria-label="Use light theme"
        aria-pressed={theme === 'light'}
        className="text-gray8 hover:text-gray10 data-[active]:bg-gray-a2 data-[active]:text-gray10 p-2"
        data-active={theme === 'light' ? '' : undefined}
        onClick={() => setTheme('light')}
        type="button"
      >
        <IconLucideSun className="size-4" />
      </button>
      <button
        aria-label="Use system theme"
        aria-pressed={theme === 'system'}
        className="text-gray8 hover:text-gray10 data-[active]:bg-gray-a2 data-[active]:text-gray10 p-2"
        data-active={theme === 'system' ? '' : undefined}
        onClick={() => setTheme('system')}
        type="button"
      >
        <IconLucideMonitor className="size-4" />
      </button>
      <button
        aria-label="Use dark theme"
        aria-pressed={theme === 'dark'}
        className="text-gray8 hover:text-gray10 data-[active]:bg-gray-a2 data-[active]:text-gray10 p-2"
        data-active={theme === 'dark' ? '' : undefined}
        onClick={() => setTheme('dark')}
        type="button"
      >
        <IconLucideMoon className="size-4" />
      </button>
    </div>
  )
}

function SidebarNav(props: { items: Array<SidebarItem>; onNavigate: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {props.items.map((item) => (
        <SidebarNavItem item={item} key={item.label} onNavigate={props.onNavigate} />
      ))}
    </ul>
  )
}

function SidebarNavItem(props: { item: SidebarItem; onNavigate: () => void }) {
  const { item, onNavigate } = props

  if (item.type === 'group')
    return (
      <li className="mt-4 first:mt-0">
        <span className="text-gray8 text-xs font-medium tracking-wide uppercase">{item.label}</span>
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {item.items.map((child) => (
            <SidebarNavItem item={child} key={child.label} onNavigate={onNavigate} />
          ))}
        </ul>
      </li>
    )

  const to = `/docs${item.path}`
  return (
    <li>
      <Link
        activeOptions={{ exact: true }}
        activeProps={{ className: 'text-gray10 bg-gray-a2' }}
        className="text-gray8 hover:text-gray10 hover:bg-gray-a2 block px-2 py-1.5 text-sm"
        onClick={onNavigate}
        to={to}
      >
        {item.label}
      </Link>
    </li>
  )
}
