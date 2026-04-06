import { Menu } from '@base-ui/react/menu'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import * as Nav from '#components/Nav.tsx'
import { createClient } from '#db/client.ts'
import * as Cookie from '#lib/cookie.ts'
import { formatCost } from '#lib/format.ts'
import { rpc } from '#lib/rpc.ts'

export const Route = createFileRoute('/~dash/$login')({
  head() {
    return { meta: [{ title: `Dashboard - ${__HOST__}` }] }
  },
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
  loader: ({ context }) =>
    getDashboardData({ data: { entityId: context.entity.id, entityType: context.entity.type } }),
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

  return (
    <div className="relative flex min-h-dvh flex-col">
      <Nav.Skip />
      <Nav.Root>
        <Menu.Root>
          <Menu.Trigger className="hover:bg-gray-a2 flex cursor-default items-center gap-2 p-1 text-sm">
            <EntityAvatar
              avatarUrl={entity.type === 'account' ? account.avatar_url : undefined}
              name={entity.name ?? entity.login}
            />
            <span>{entity.name ?? entity.login}</span>
            <IconOcticonChevronDown16 className="text-gray8 size-3.5" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner align="start" sideOffset={8}>
              <Menu.Popup className="bg-bg1 border-gray-a3 before:bg-gray-a1/50 relative min-w-48 border px-1 py-1 before:absolute before:inset-0 before:-z-1">
                {others.map((e) => (
                  <Menu.Item
                    className="text-gray9 hover:bg-gray-a2 hover:text-gray10 flex items-center gap-2 p-1.5 text-sm"
                    key={e.login}
                    render={<Link params={{ login: e.login }} to="/~dash/$login" />}
                  >
                    <EntityAvatar
                      avatarUrl={e.type === 'account' ? account.avatar_url : undefined}
                      name={e.name ?? e.login}
                    />
                    {e.name ?? e.login}
                  </Menu.Item>
                ))}
                <div className="border-gray-a2 -mx-1 my-1 border-t" />
                <Menu.Item
                  className="text-gray9 hover:bg-gray-a2 hover:text-gray10 flex min-h-9 items-center p-1.5 text-sm disabled:opacity-30"
                  disabled={logout.isPending}
                  onClick={() => logout.mutate()}
                >
                  Sign Out
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        <Nav.Group>
          <Link className="text-gray8 hover:text-gray10 px-3 py-1.5 text-sm" to="/">
            Docs
          </Link>
        </Nav.Group>
      </Nav.Root>

      <main className="flex-1" id={Nav.skipId}>
        <DashboardContent key={entity.id} />
      </main>
    </div>
  )
}

function DashboardContent() {
  const { entity } = Route.useRouteContext()
  const loaderData = Route.useLoaderData()
  const fetchDashboard = useServerFn(getDashboardData)

  const { data: dashboard } = useQuery({
    initialData: loaderData,
    queryKey: ['dashboard', entity.id],
    queryFn: () => fetchDashboard({ data: { entityId: entity.id, entityType: entity.type } }),
    refetchInterval: 10_000,
  })

  const balanceDollars = (dashboard.balance_mills / 1000).toFixed(2)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-6 pb-16">
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Tokens Saved"
          value={Math.round(dashboard.tokens_saved).toLocaleString()}
        />
        <StatCard label="Cost Saved" value={`$${formatCost(dashboard.tokens_saved, 3)}`} />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-bold">Billing</h2>
        <div className="bg-gray-a1/50 border-gray-a3 mt-4 flex items-center justify-between border px-3 py-3">
          <span className="text-gray8 text-xs">Credits Remaining</span>
          <span className="text-sm font-bold tabular-nums">${balanceDollars}</span>
        </div>
        {dashboard.payment_method ? (
          <div className="bg-gray-a1/50 border-gray-a3 -mt-px flex items-center justify-between border px-3 py-3">
            <div className="flex items-center gap-3">
              <IconLucideCreditCard className="text-gray8 size-5" />
              <div>
                <span className="text-sm font-medium capitalize">
                  {dashboard.payment_method.brand}
                </span>
                <span className="text-gray8 ms-2 text-sm">
                  **** {dashboard.payment_method.last4}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-a1/50 border-gray-a3 -mt-px flex items-center justify-between border border-dashed px-3 py-6">
            <span className="text-gray8 text-sm">No payment method on file</span>
          </div>
        )}
      </div>
    </div>
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

function StatCard(props: { label: string; value: string }) {
  return (
    <div className="bg-gray-a1/50 border-gray-a3 border px-3 py-3">
      <div className="text-gray8 text-xs">{props.label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{props.value}</div>
    </div>
  )
}

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

    // Fetch all orgs the user belongs to
    const organizations = await db
      .selectFrom('organization')
      .innerJoin('organization_member', 'organization_member.organization_id', 'organization.id')
      .where('organization.deleted_at', 'is', null)
      .where('organization_member.account_id', '=', accountId)
      .select(['organization.id', 'organization.login', 'organization.name'])
      .execute()

    // Check if login matches the logged-in account
    if (account.login === c.data.login)
      return { account, entity: { type: 'account' as const, ...account }, organizations }

    // Check if login matches an organization the user belongs to
    const org = organizations.find((o) => o.login === c.data.login)
    if (!org) return null

    return { account, entity: { type: 'organization' as const, ...org }, organizations }
  })

const getDashboardData = createServerFn({ method: 'GET' })
  .inputValidator((d: { entityId: string; entityType: 'account' | 'organization' }) => d)
  .handler(async (c) => {
    const request = getRequest()
    const db = createClient(env.DB.connectionString)
    const sessionId = await Cookie.parseSigned(
      request.headers.get('cookie') ?? '',
      env.COOKIE_SECRET,
      'curl.session',
    )
    if (!sessionId) return { balance_mills: 0, payment_method: null, tokens_saved: 0 }

    const table = c.data.entityType === 'organization' ? 'organization' : 'account'
    const billing = await db
      .selectFrom(table)
      .where('id', '=', c.data.entityId)
      .select(['balance_mills', 'stripe_customer_id'])
      .executeTakeFirst()

    let paymentMethod: { brand: string; last4: string } | null = null
    if (billing?.stripe_customer_id) {
      const { default: Stripe } = await import('stripe')
      const stripeUrl = new URL(env.STRIPE_API_URL)
      const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
        host: stripeUrl.hostname,
        port: Number(stripeUrl.port) || (stripeUrl.protocol === 'https:' ? 443 : 80),
        protocol: stripeUrl.protocol.replace(':', '') as 'http' | 'https',
      })
      const methods = await stripe.paymentMethods.list({
        customer: billing.stripe_customer_id,
        type: 'card',
        limit: 1,
      })
      const card = methods.data[0]?.card
      if (card) paymentMethod = { brand: card.brand, last4: card.last4 }
    }

    const requestColumn = c.data.entityType === 'organization' ? 'organization_id' : 'account_id'
    const statsResult = await db
      .selectFrom('request')
      .where(requestColumn, '=', c.data.entityId)
      .select((eb) => eb.fn.sum<number>('tokens_saved').as('total'))
      .executeTakeFirst()

    return {
      balance_mills: billing?.balance_mills ?? 0,
      payment_method: paymentMethod,
      tokens_saved: Number(statsResult?.total ?? 0),
    }
  })
