import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { createClient } from '#db/client.ts'
import * as Cookie from '#lib/cookie.ts'

export const Route = createFileRoute('/~dash/$login/~/billing')({
  head: () => ({ meta: [{ title: `Billing - ${__HOST__}` }] }),
  loader: ({ context }) => {
    if (!context.entity) return { balance_mills: 0, payment_method: null }
    return getBillingData({
      data: { entityId: context.entity.id, entityType: context.entity.type },
    })
  },
  component: Component,
})

function Component() {
  const { entity } = Route.useRouteContext()
  const loaderData = Route.useLoaderData()
  const fetchBilling = useServerFn(getBillingData)

  const { data } = useQuery({
    initialData: loaderData,
    queryKey: ['dashboard-billing', entity.id],
    queryFn: () => fetchBilling({ data: { entityId: entity.id, entityType: entity.type } }),
    refetchInterval: 10_000,
  })

  const balanceDollars = (data.balance_mills / 1000).toFixed(2)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-6 pb-16">
      <h1 className="text-lg font-bold">Billing</h1>
      <div className="bg-gray-a1/50 border-gray-a3 mt-4 flex items-center justify-between border px-3 py-3">
        <span className="text-gray8 text-xs">Credits Remaining</span>
        <span className="text-sm font-bold tabular-nums">${balanceDollars}</span>
      </div>
      {data.payment_method ? (
        <div className="bg-gray-a1/50 border-gray-a3 -mt-px flex items-center justify-between border px-3 py-3">
          <div className="flex items-center gap-3">
            <IconOcticonCreditCard16 className="text-gray8 size-5" />
            <div>
              <span className="text-sm font-medium capitalize">{data.payment_method.brand}</span>
              <span className="text-gray8 ms-2 text-sm">---- {data.payment_method.last4}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-a1/50 border-gray-a3 -mt-px flex items-center justify-between border border-dashed px-3 py-6">
          <span className="text-gray8 text-sm">No payment method on file</span>
        </div>
      )}
    </div>
  )
}

// --- Server function ---

const getBillingData = createServerFn({ method: 'GET' })
  .inputValidator((d: { entityId: string; entityType: 'account' | 'organization' }) => d)
  .handler(async (c) => {
    const request = getRequest()
    const db = createClient(env.DB.connectionString)
    const sessionId = await Cookie.parseSigned(
      request.headers.get('cookie') ?? '',
      env.COOKIE_SECRET,
      'curl.session',
    )
    if (!sessionId) return { balance_mills: 0, payment_method: null }

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

    return {
      balance_mills: billing?.balance_mills ?? 0,
      payment_method: paymentMethod,
    }
  })
