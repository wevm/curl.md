import { Menu } from '@base-ui/react/menu'
import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { Nav } from '#components/Nav.tsx'
import { type Theme, useTheme } from '#hooks/useTheme.ts'
import { getSessionLogin } from '#server/session.ts'
import { sidebar, type SidebarItem } from '../../../docs/_sidebar.ts'
import { getThemeIconTheme } from './-theme.ts'

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

  return (
    <div className="relative flex min-h-dvh flex-col">
      <Nav.Skip />

      <nav className="bg-bg1 border-gray-a3 fixed inset-x-0 top-0 z-50 h-17 border-b">
        <div className="mx-auto flex h-full w-full max-w-[90rem] items-center ps-8 pe-6">
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
              <div className="flex min-h-full flex-col">
                <SidebarNav items={sidebar} onNavigate={() => setOpen(false)} />
                <div className="mt-auto pt-4">
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1" id={Nav.skipId}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

function ThemeToggle() {
  const { mounted, resolvedTheme, setTheme, theme } = useTheme()
  const activeTheme = themeOptions.find((option) => option.value === theme) ?? themeOptions[0]!

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger className="text-gray8 hover:text-gray10 hover:bg-gray-a2 data-[popup-open]:bg-gray-a2 data-[popup-open]:text-gray10 flex w-full items-center gap-2 px-3 py-2 text-xs outline-none">
        {getThemeIcon(activeTheme.value, resolvedTheme, mounted)}
        <span className="flex-1 text-left">{activeTheme.label}</span>
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner align="start" className="z-60 min-w-[var(--anchor-width)]" sideOffset={8}>
          <Menu.Popup className="bg-bg1 border-gray-a3 w-full border p-1 shadow-2xl outline-none">
            <Menu.RadioGroup onValueChange={(value) => setTheme(value as Theme)} value={theme}>
              {themeOptions.map((option) => (
                <Menu.RadioItem
                  className="text-gray8 data-[checked]:text-gray10 data-[highlighted]:bg-gray-a2 data-[highlighted]:text-gray10 flex items-center gap-2 px-3 py-2 text-xs outline-none"
                  closeOnClick
                  key={option.value}
                  value={option.value}
                >
                  <span className="flex-1">{option.label}</span>
                  <Menu.RadioItemIndicator className="text-blue9">
                    <IconOcticonCheck16 className="size-3.5" />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

const themeOptions = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
] satisfies Array<{ label: string; value: Theme }>

function getThemeIcon(theme: Theme, resolvedTheme: Exclude<Theme, 'system'>, mounted: boolean) {
  const iconTheme = getThemeIconTheme(theme, resolvedTheme, mounted)

  if (iconTheme === 'system') return <IconLucideMonitor className="size-3.5" />

  if (iconTheme === 'light') return <IconLucideSun className="size-3.5" />
  return <IconMaterialSymbolsDarkMode className="size-3.5" />
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
      <li className="mt-6 first:mt-0">
        <span className="text-gray8 block px-2 text-xs font-medium tracking-wide uppercase">
          {item.label}
        </span>
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
