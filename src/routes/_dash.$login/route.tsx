import { Menu } from '@base-ui/react/menu'
import { useMutation } from '@tanstack/react-query'
import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
  redirect,
  useMatches,
  useRouter,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import * as React from 'react'
import { createClient } from '#db/client.ts'
import * as Cookie from '#lib/cookie.ts'
import { rpc } from '#lib/rpc.ts'

export const Route = createFileRoute('/_dash/$login')({
  async beforeLoad({ location, params }) {
    const data = await getLayoutData({ data: { login: params.login } })
    if (data === false)
      throw redirect({
        to: '/login',
        search: { next: location.publicHref ?? location.pathname },
      })
    if (!data) throw notFound()
    return data
  },
  loader: () => {},
  component: Component,
})

function Component() {
  const { account, entity, organizations } = Route.useRouteContext()
  const router = useRouter()

  const logout = useMutation({
    async mutationFn() {
      await rpc.api.auth.logout.$post()
    },
    onSuccess() {
      return router.navigate({ to: '/' })
    },
  })

  const others = [
    ...(account.login !== entity.login
      ? [{ login: account.login, name: account.name, type: 'account' as const }]
      : []),
    ...organizations
      .filter((o) => o.login !== entity.login)
      .map((o) => ({ login: o.login, name: o.name, type: 'organization' as const })),
  ]

  const matches = useMatches()
  const leafRouteId = matches[matches.length - 1]?.routeId
  const switchTo =
    leafRouteId === '/_dash/$login/billing'
      ? '/$login/billing'
      : leafRouteId === '/_dash/$login/settings'
        ? '/$login/settings'
        : '/$login'
  const [open, setOpen] = React.useState(false)

  return (
    <div className="relative flex min-h-dvh flex-col md:flex-row">
      <aside className="flex flex-row flex-wrap items-center justify-between px-4 py-4 md:sticky md:top-0 md:h-dvh md:w-48 md:flex-col md:flex-nowrap md:items-stretch md:justify-start">
        <AccountSwitcher
          account={account}
          entity={entity}
          logout={logout}
          others={others}
          switchTo={switchTo}
        />
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

        <nav
          className="mt-4 hidden w-full flex-col gap-0.5 data-[open]:flex md:flex"
          data-open={open ? '' : undefined}
          onClick={() => setOpen(false)}
        >
          <SidebarLink
            activeOptions={{ exact: true }}
            icon={<IconOcticonMeter16 />}
            params={{ login: entity.login }}
            to="/$login"
          >
            Overview
          </SidebarLink>
          <SidebarDisabled icon={<IconOcticonGlobe16 />}>Requests</SidebarDisabled>
          {entity.type === 'organization' && (
            <SidebarDisabled icon={<IconOcticonPeople16 />}>Members</SidebarDisabled>
          )}
          <SidebarDisabled icon={<IconOcticonKey16 />}>API Tokens</SidebarDisabled>
          <SidebarLink
            icon={<IconOcticonCreditCard16 />}
            params={{ login: entity.login }}
            to="/$login/billing"
          >
            Billing
          </SidebarLink>
          <SidebarLink
            icon={<IconOcticonGear16 />}
            params={{ login: entity.login }}
            to="/$login/settings"
          >
            Settings
          </SidebarLink>

          <Link
            className="text-gray8 hover:text-gray10 hover:bg-gray-a2 flex items-center gap-2 px-2 py-1.5 text-sm"
            to="/"
          >
            <IconOcticonBook16 />
            Docs
          </Link>
          <Link
            className="text-gray8 hover:text-gray10 hover:bg-gray-a2 flex items-center gap-2 px-2 py-1.5 text-sm"
            to="/playground"
          >
            <IconOcticonTerminal16 />
            Playground
          </Link>
        </nav>
      </aside>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

// --- Internal components ---

function AccountSwitcher(props: {
  account: { avatar_url: string | null; login: string }
  entity: { login: string; name: string | null; type: 'account' | 'organization' }
  logout: { isPending: boolean; mutate: () => void }
  others: Array<{ login: string; name: string | null; type: 'account' | 'organization' }>
  switchTo: string
}) {
  return (
    <Menu.Root>
      <Menu.Trigger className="hover:bg-gray-a2 flex cursor-default items-center gap-2 px-2 py-1.5 text-sm">
        <EntityAvatar
          avatarUrl={props.entity.type === 'account' ? props.account.avatar_url : undefined}
          name={props.entity.name ?? props.entity.login}
        />
        <span>{props.entity.name ?? props.entity.login}</span>
        <IconOcticonChevronDown16 className="text-gray8 size-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start" className="max-md:!w-[calc(100vw-2rem)]" sideOffset={8}>
          <Menu.Popup className="bg-bg1 border-gray-a3 before:bg-gray-a1/50 relative min-w-48 border px-1 py-1 before:absolute before:inset-0 before:-z-1">
            {props.others.map((e) => (
              <Menu.Item
                className="text-gray9 hover:bg-gray-a2 hover:text-gray10 flex items-center gap-2 p-1.5 text-sm"
                key={e.login}
                render={<Link params={{ login: e.login }} to={props.switchTo} />}
              >
                <EntityAvatar
                  avatarUrl={e.type === 'account' ? props.account.avatar_url : undefined}
                  name={e.name ?? e.login}
                />
                {e.name ?? e.login}
              </Menu.Item>
            ))}
            <div className="border-gray-a2 -mx-1 my-1 border-t" />
            <Menu.Item
              className="text-gray9 hover:bg-gray-a2 hover:text-gray10 flex min-h-9 items-center p-1.5 text-sm disabled:opacity-30"
              disabled={props.logout.isPending}
              onClick={() => props.logout.mutate()}
            >
              Sign Out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

function SidebarLink(
  props: React.PropsWithChildren<{
    activeOptions?: { exact: boolean }
    icon: React.ReactNode
    params: Record<string, string>
    to: string
  }>,
) {
  return (
    <Link
      {...(props.activeOptions ? { activeOptions: props.activeOptions } : {})}
      activeProps={{ className: 'text-gray10 bg-gray-a2' }}
      className="text-gray8 hover:text-gray10 hover:bg-gray-a2 flex items-center gap-2 px-2 py-1.5 text-sm"
      params={props.params}
      to={props.to}
    >
      {props.icon}
      {props.children}
    </Link>
  )
}

function SidebarDisabled(props: React.PropsWithChildren<{ icon: React.ReactNode }>) {
  return (
    <span className="text-gray5 flex cursor-not-allowed items-center gap-2 px-2 py-1.5 text-sm">
      {props.icon}
      {props.children}
    </span>
  )
}

function EntityAvatar(props: { avatarUrl?: string | null | undefined; name: string }) {
  if (props.avatarUrl) return <img alt={props.name} className="size-6" src={props.avatarUrl} />
  return (
    <span className="bg-gray-a3 flex size-6 items-center justify-center text-xs uppercase">
      {props.name[0]}
    </span>
  )
}

// --- Server functions ---

const getLayoutData = createServerFn({ method: 'GET' })
  .inputValidator((d: { login: string }) => d)
  .handler(async (c) => {
    const request = getRequest()
    const db = createClient(env.DB.connectionString)
    const sessionId = await Cookie.parseSigned(
      request.headers.get('cookie') ?? '',
      env.COOKIE_SECRET,
      'curl.session',
    )
    const accountId = sessionId
      ? ((
          await db
            .selectFrom('session')
            .where('id', '=', sessionId)
            .where('expires_at', '>', new Date())
            .select('account_id')
            .executeTakeFirst()
        )?.account_id ?? null)
      : null
    if (!accountId) return false

    const account = await db
      .selectFrom('account')
      .where('id', '=', accountId)
      .select(['avatar_url', 'email', 'id', 'login', 'name'])
      .executeTakeFirst()
    if (!account) return false

    const organizations = await db
      .selectFrom('organization')
      .innerJoin('organization_member', 'organization_member.organization_id', 'organization.id')
      .where('organization.deleted_at', 'is', null)
      .where('organization_member.account_id', '=', accountId)
      .select(['organization.id', 'organization.login', 'organization.name'])
      .execute()

    if (account.login === c.data.login)
      return { account, entity: { type: 'account' as const, ...account }, organizations }

    const org = organizations.find((o) => o.login === c.data.login)
    if (!org) return null

    return { account, entity: { type: 'organization' as const, ...org }, organizations }
  })
