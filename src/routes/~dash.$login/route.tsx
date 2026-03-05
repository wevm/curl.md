import { env } from 'cloudflare:workers'
import { useMutation } from '@tanstack/react-query'
import {
  createFileRoute,
  Outlet,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getDb } from '#lib/db.ts'
import { rpc } from '#lib/rpc.ts'
import * as Session from '#lib/session.ts'

export const Route = createFileRoute('/~dash/$login')({
  beforeLoad: async ({ location, params }) => {
    const data = await getLayoutData({ data: { login: params.login } })
    if (!data)
      throw redirect({
        to: '/login',
        search: { next: location.publicHref ?? location.pathname },
      })
    return data
  },
  component: DashboardLayout,
})

function DashboardLayout() {
  const { account } = Route.useRouteContext()
  const router = useRouter()

  const logout = useMutation({
    mutationFn: async () => {
      await rpc.api.auth.logout.$post()
    },
    onSuccess: () => router.navigate({ to: '/' }),
  })

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-6 pt-6 pb-16">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          {account.avatar_url ? (
            <img
              alt={account.name ?? account.email}
              className="size-8 rounded-full"
              src={account.avatar_url}
            />
          ) : null}
          <span className="font-bold">{account.name ?? account.login}</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            className="text-gray9 hover:text-gray10 hover:underline dark:text-gray6"
            href="/"
          >
            Home
          </a>
          <button
            className="text-gray9 hover:text-gray10 hover:underline disabled:opacity-50 dark:text-gray6"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
            type="button"
          >
            Sign Out
          </button>
        </div>
      </div>
      <div className="pt-6">
        <Outlet />
      </div>
    </div>
  )
}

const getLayoutData = createServerFn({ method: 'GET' })
  .inputValidator((d: { login: string }) => d)
  .handler(async ({ data: { login } }) => {
    const request = getRequest()
    const db = getDb(env.DB.connectionString)
    const accountId = await Session.getAccountId(request, db, env.COOKIE_SECRET)
    if (!accountId) return null

    const account = await db
      .selectFrom('account')
      .where('id', '=', accountId)
      .select(['avatar_url', 'email', 'id', 'login', 'name'])
      .executeTakeFirst()
    if (!account) return null

    // Check if login matches the logged-in account
    if (account.login === login)
      return { account, entity: { type: 'account' as const, ...account } }

    // Check if login matches an organization the user belongs to
    const org = await db
      .selectFrom('organization')
      .innerJoin(
        'organization_member',
        'organization_member.organization_id',
        'organization.id',
      )
      .where('organization.login', '=', login)
      .where('organization.deleted_at', 'is', null)
      .where('organization_member.account_id', '=', accountId)
      .select(['organization.id', 'organization.login', 'organization.name'])
      .executeTakeFirst()
    if (!org) return null

    return { account, entity: { type: 'organization' as const, ...org } }
  })
