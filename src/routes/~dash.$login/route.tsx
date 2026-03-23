import { useMutation } from '@tanstack/react-query'
import {
  Link,
  createFileRoute,
  notFound,
  Outlet,
  redirect,
  useRouter,
} from '@tanstack/react-router'
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
  const { account, entity } = Route.useRouteContext()
  const router = useRouter()
  const params = Route.useParams()

  const logout = useMutation({
    async mutationFn() {
      await rpc.api.auth.logout.$post()
    },
    onSuccess() {
      return router.navigate({ to: '/' })
    },
  })

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl gap-8 px-6 pt-6 pb-16">
      <nav className="flex w-48 shrink-0 flex-col gap-1 pt-2">
        <div className="mb-4 font-bold">{entity.name ?? entity.login}</div>

        <Link
          activeOptions={{ exact: true }}
          className="py-1 [&.active]:font-bold"
          params={params}
          to="/~dash/$login"
        >
          <IconLucideLayoutDashboard className="mr-2 inline-block size-4" />
          Overview
        </Link>
        <Link className="py-1 [&.active]:font-bold" params={params} to="/~dash/$login/requests">
          <IconLucideArrowUpRight className="mr-2 inline-block size-4" />
          Requests
        </Link>

        <hr className="my-3" />

        <span className="mb-1 text-xs font-medium tracking-wide uppercase opacity-50">
          Settings
        </span>
        <Link
          className="py-1 [&.active]:font-bold"
          params={params}
          to="/~dash/$login/settings/general"
        >
          <IconLucideSettings className="mr-2 inline-block size-4" />
          General
        </Link>
        <Link
          className="py-1 [&.active]:font-bold"
          params={params}
          to="/~dash/$login/settings/members"
        >
          <IconLucideUsers className="mr-2 inline-block size-4" />
          Members
        </Link>
        <Link
          className="py-1 [&.active]:font-bold"
          params={params}
          to="/~dash/$login/settings/billing"
        >
          <IconLucideCreditCard className="mr-2 inline-block size-4" />
          Billing
        </Link>
        <Link
          className="py-1 [&.active]:font-bold"
          params={params}
          to="/~dash/$login/settings/tokens"
        >
          <IconLucideKey className="mr-2 inline-block size-4" />
          Tokens
        </Link>

        <div className="mt-auto flex flex-col gap-1 pt-8">
          <div className="mb-1 flex items-center gap-2">
            {account.avatar_url ? (
              <img
                alt={account.name ?? account.email}
                className="size-5 rounded-full"
                src={account.avatar_url}
              />
            ) : null}
            <span className="text-sm font-medium">{account.name ?? account.login}</span>
          </div>
          <a className="py-1 text-sm opacity-60 hover:opacity-100" href="/">
            Home
          </a>
          <button
            className="py-1 text-left text-sm opacity-60 hover:opacity-100 disabled:opacity-30"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
            type="button"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <main className="min-w-0 flex-1 pt-2">
        <Outlet />
      </main>
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
