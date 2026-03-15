import { useMutation } from '@tanstack/react-query'
import { createFileRoute, notFound, Outlet, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { createClient } from '#db/client.ts'
import * as Cookie from '#lib/cookie.ts'
import { rpc } from '#lib/rpc.ts'

export const Route = createFileRoute('/~dash/$login')({
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
  component: DashboardLayout,
})

function DashboardLayout() {
  const { account } = Route.useRouteContext()
  const router = useRouter()

  const logout = useMutation({
    async mutationFn() {
      await rpc.api.auth.logout.$post()
    },
    onSuccess() {
      return router.navigate({ to: '/' })
    },
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
          <a className="text-gray9 hover:text-gray10 dark:text-gray6 hover:underline" href="/">
            Home
          </a>
          <button
            className="text-gray9 hover:text-gray10 dark:text-gray6 hover:underline disabled:opacity-50"
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

    // Check if login matches the logged-in account
    if (account.login === login)
      return { account, entity: { type: 'account' as const, ...account } }

    // Check if login matches an organization the user belongs to
    const org = await db
      .selectFrom('organization')
      .innerJoin('organization_member', 'organization_member.organization_id', 'organization.id')
      .where('organization.login', '=', login)
      .where('organization.deleted_at', 'is', null)
      .where('organization_member.account_id', '=', accountId)
      .select(['organization.id', 'organization.login', 'organization.name'])
      .executeTakeFirst()
    if (!org) return null

    return { account, entity: { type: 'organization' as const, ...org } }
  })
