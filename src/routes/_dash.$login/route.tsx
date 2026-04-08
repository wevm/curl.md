import { Field } from '@base-ui/react/field'
import { Menu } from '@base-ui/react/menu'
import { useMutation } from '@tanstack/react-query'
import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
  redirect,
  useMatches,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import * as React from 'react'
import { z } from 'zod/v4'
import { Dashboard } from '#components/Dashboard.tsx'
import { Dialog } from '#components/Dialog.tsx'
import { Nav } from '#components/Nav.tsx'
import { createClient } from '#db/client.ts'
import * as Cookie from '#lib/cookie.ts'
import { rpc } from '#lib/rpc.ts'

const searchSchema = z.object({
  modal: z.enum(['create_org']).optional(),
})

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
  validateSearch: searchSchema,
  loader: () => {},
  component: Component,
  notFoundComponent: DashboardNotFound,
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
  const { modal } = Route.useSearch()
  const navigate = useNavigate()
  const createOrgOpen = modal === 'create_org'
  const setCreateOrgOpen = React.useCallback(
    (open: boolean) =>
      navigate({
        from: '/$login',
        search: (prev) => ({ ...prev, modal: open ? ('create_org' as const) : undefined }),
      }),
    [navigate],
  )

  return (
    <div className="relative flex min-h-dvh flex-col md:flex-row" data-dashboard>
      <Nav.Skip />
      <aside className="bg-bg1 border-gray-a3 sticky top-0 z-10 flex flex-row flex-wrap items-center justify-between border-b md:fixed md:top-0 md:h-dvh md:w-52 md:flex-col md:flex-nowrap md:items-stretch md:justify-start md:overflow-hidden md:border-e md:border-b-0">
        <div className="flex w-full items-center justify-between px-4 py-4 md:block">
          <AccountSwitcher
            account={account}
            entity={entity}
            logout={logout}
            onCreateOrg={() => setCreateOrgOpen(true)}
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
        </div>

        <nav
          className="minimal-scrollbar mt-4 hidden w-full flex-col data-[open]:flex md:mt-0 md:flex md:min-h-0 md:flex-1 md:overflow-y-auto md:[scrollbar-gutter:stable]"
          data-open={open ? '' : undefined}
          onClick={() => setOpen(false)}
        >
          <div className="flex flex-col gap-0.5 ps-4 pe-1 pb-4">
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

            <div className="border-gray-a3 my-1.5 border-t" />

            <Link
              className="text-gray8 hover:text-gray10 hover:bg-gray-a2 flex w-full items-center gap-2 px-2 py-1.5 text-sm"
              to="/docs"
            >
              <IconOcticonBook16 />
              Docs
            </Link>
            <Link
              className="text-gray8 hover:text-gray10 hover:bg-gray-a2 flex w-full items-center gap-2 px-2 py-1.5 text-sm"
              to="/playground"
            >
              <IconOcticonTerminal16 />
              Playground
            </Link>
          </div>
        </nav>
      </aside>
      <CreateOrgDialog
        onSuccess={(login) => router.navigate({ params: { login }, search: {}, to: '/$login' })}
        open={createOrgOpen}
        setOpen={setCreateOrgOpen}
      />
      <main className="min-w-0 flex-1 md:ms-52" id={Nav.skipId}>
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
  onCreateOrg: () => void
  others: Array<{ login: string; name: string | null; type: 'account' | 'organization' }>
  switchTo: string
}) {
  return (
    <Menu.Root>
      <Menu.Trigger className="hover:bg-gray-a2 flex cursor-default items-center gap-2 px-2 py-1.5 text-sm select-none md:w-full">
        <EntityAvatar
          avatarUrl={props.entity.type === 'account' ? props.account.avatar_url : undefined}
          name={props.entity.name ?? props.entity.login}
        />
        <span className="truncate">{props.entity.name ?? props.entity.login}</span>
        <IconLucideChevronsUpDown className="text-gray8 ms-auto size-3.5 shrink-0" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start" className="z-20 max-md:!w-[calc(100vw-2rem)]" sideOffset={8}>
          <Menu.Popup className="bg-bg1 border-gray-a3 before:bg-gray-a1/50 relative min-w-56 border px-1 py-1 select-none before:absolute before:inset-0 before:-z-1 md:max-w-64">
            {props.others.map((e) => (
              <Menu.Item
                className="text-gray9 hover:bg-gray-a2 hover:text-gray10 flex items-center gap-2 p-1.5 text-sm select-none"
                key={e.login}
                render={<Link params={{ login: e.login }} to={props.switchTo} />}
              >
                <EntityAvatar
                  avatarUrl={e.type === 'account' ? props.account.avatar_url : undefined}
                  name={e.name ?? e.login}
                />
                <span className="truncate">{e.name ?? e.login}</span>
              </Menu.Item>
            ))}
            {props.others.length > 0 && <div className="border-gray-a2 -mx-1 my-1 border-t" />}
            <Menu.Item
              className="text-gray9 hover:bg-gray-a2 hover:text-gray10 flex min-h-9 items-center gap-2 p-1.5 text-sm select-none"
              onClick={props.onCreateOrg}
            >
              <IconOcticonPlus16 className="size-4" />
              Create Organization
            </Menu.Item>
            <div className="border-gray-a2 -mx-1 my-1 border-t" />
            <Menu.Item
              className="text-gray9 hover:bg-gray-a2 hover:text-gray10 flex min-h-9 items-center gap-2 p-1.5 text-sm select-none disabled:opacity-30"
              disabled={props.logout.isPending}
              onClick={() => props.logout.mutate()}
            >
              <IconOcticonSignOut16 className="size-4" />
              Sign Out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

function DashboardNotFound() {
  const { login } = Route.useParams()

  return (
    <Dashboard.Content>
      <Dashboard.Heading level={1}>Not Found</Dashboard.Heading>
      <div className="bg-gray-a1/50 border-gray-a3 border px-4 py-5">
        <p className="text-sm font-bold">This dashboard page does not exist.</p>
        <p className="text-gray8 mt-1 text-sm">Check the URL or go back to the overview.</p>
        <Link
          className="bg-gray10 text-bg1 mt-4 inline-flex px-3 py-1.5 text-sm transition-opacity hover:opacity-90"
          params={{ login }}
          to="/$login"
        >
          Back to overview
        </Link>
      </div>
    </Dashboard.Content>
  )
}

function CreateOrgDialog(props: {
  onSuccess: (login: string) => void
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const [error, setError] = React.useState<string | null>(null)
  const create = useMutation({
    async mutationFn(formData: FormData) {
      const login = formData.get('login') as string
      const name = (formData.get('name') as string) || undefined
      const res = await rpc.api.orgs.$post({ json: { login, name } })
      if (res.status !== 200) {
        const body = await res.json()
        throw new Error('message' in body ? body.message : 'Failed to create organization')
      }
      return res.json()
    },
    onError(err) {
      setError(err.message)
    },
    onSuccess(data) {
      props.onSuccess(data.login)
    },
  })

  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => {
        props.setOpen(open)
        if (!open) {
          setError(null)
          create.reset()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.CloseX />
          <Dialog.Title>Create Organization</Dialog.Title>
          <Dialog.Description>
            Organizations let you collaborate with others and manage shared usage.
          </Dialog.Description>
          <form
            className="flex flex-col gap-4"
            data-1p-ignore
            onSubmit={(e) => {
              e.preventDefault()
              create.mutate(new FormData(e.currentTarget))
            }}
          >
            <Field.Root>
              <Field.Label className="text-gray9 text-sm">Login</Field.Label>
              <Field.Control
                autoComplete="off"
                className="bg-gray-a1/50 border-gray-a3 w-full border px-3 py-2 text-sm"
                data-1p-ignore
                name="login"
                pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
                placeholder="my-org"
                required
              />
              <Field.Description className="text-gray8 text-xs">
                Lowercase letters, numbers, and hyphens only.
              </Field.Description>
            </Field.Root>
            <Field.Root>
              <Field.Label className="text-gray9 text-sm">Name (optional)</Field.Label>
              <Field.Control
                className="bg-gray-a1/50 border-gray-a3 w-full border px-3 py-2 text-sm"
                name="name"
                placeholder="My Organization"
              />
            </Field.Root>
            {error && <p className="text-red9 text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <Dialog.Close className="text-gray9 hover:bg-gray-a2 px-3 py-1.5 text-sm">
                Cancel
              </Dialog.Close>
              <button
                className="bg-gray10 text-bg1 px-3 py-1.5 text-sm disabled:opacity-50"
                disabled={create.isPending}
                type="submit"
              >
                {create.isPending ? 'Creating' : 'Create'}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
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
      className="text-gray8 hover:text-gray10 hover:bg-gray-a2 flex w-full items-center gap-2 px-2 py-1.5 text-sm"
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
    <span className="text-gray5 flex w-full cursor-not-allowed items-center gap-2 px-2 py-1.5 text-sm select-none">
      {props.icon}
      {props.children}
    </span>
  )
}

function EntityAvatar(props: { avatarUrl?: string | null | undefined; name: string }) {
  if (props.avatarUrl)
    return <img alt={props.name} className="size-6 shrink-0" src={props.avatarUrl} />
  return (
    <span className="bg-gray-a3 flex size-6 shrink-0 items-center justify-center text-xs uppercase">
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
