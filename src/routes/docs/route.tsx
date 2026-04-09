import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { Nav } from '#components/Nav.tsx'
import { sidebar, type SidebarItem } from '../../../docs/_sidebar.ts'

export const Route = createFileRoute('/docs')({
  component: Component,
})

function Component() {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="relative flex min-h-dvh flex-col">
      <Nav.Skip />

      <nav className="bg-bg1 border-gray-a3 fixed inset-x-0 top-0 z-50 flex h-12 items-center border-b px-6">
        <Nav.Logo />
        <Nav.Group>
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
      </nav>

      <div className="mt-12 flex flex-1">
        <aside
          className="bg-bg1 border-gray-a3 fixed top-12 bottom-0 z-40 hidden w-56 overflow-y-auto border-e py-6 ps-6 pe-4 data-[open]:block md:block"
          data-open={open ? '' : undefined}
        >
          <SidebarNav items={sidebar} onNavigate={() => setOpen(false)} />
        </aside>

        <div className="min-w-0 flex-1 md:ms-56">
          <Outlet />
        </div>
      </div>
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
