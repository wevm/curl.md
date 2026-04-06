import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import * as React from 'react'
import Stripe from 'stripe'
import { z } from 'zod/mini'
import { Nav } from '#components/Nav.tsx'
import { stripeAppearance } from '#components/stripe.ts'
import { useTheme } from '#hooks/useTheme.ts'
import { creditAmounts } from '#lib/constants.ts'
import { estimateRequests } from '#lib/format.ts'

export const Route = createFileRoute('/credits/add/$id')({
  head() {
    return { meta: [{ title: `Add Credits - ${__HOST__}` }] }
  },
  validateSearch: z.object({ next: z.optional(z.string()) }),
  loader: ({ params }) => getPayment({ data: { id: params.id } }),
  component: Component,
})

function Component() {
  const params = Route.useParams()
  const search = Route.useSearch()
  const data = Route.useLoaderData()

  const { resolvedTheme } = useTheme()
  const stripePromise = React.useMemo(
    () => (data ? loadStripe(data.publishable_key) : null),
    [data?.publishable_key, data],
  )

  if (!data || !stripePromise)
    return (
      <PageWrapper title="Add Credits" description="Add prepaid credits to your account.">
        <p className="text-red9 border-red-a3 flex h-11 items-center gap-2 border px-3 text-sm">
          <IconOcticonCircleSlash16 />
          Payment session expired or not found.
        </p>
      </PageWrapper>
    )

  return (
    <Elements
      options={{
        appearance: stripeAppearance(resolvedTheme),
        clientSecret: data.pi_secret,
        customerSessionClientSecret: data.cs_secret,
      }}
      stripe={stripePromise}
    >
      <CheckoutForm amount={data.amount} id={params.id} locked={data.locked} next={search.next} />
    </Elements>
  )
}

const amounts = creditAmounts.map(Number)

function CheckoutForm(props: {
  amount: number
  id: string
  locked: boolean
  next?: string | undefined
}) {
  const router = useRouter()
  const stripe = useStripe()
  const elements = useElements()
  const [amount, setAmount] = React.useState(props.amount)

  const updateAmount = useMutation({
    async mutationFn(newAmount: number) {
      await changeAmount({ data: { id: props.id, amount: newAmount } })
    },
    onMutate(newAmount) {
      setAmount(newAmount)
    },
  })

  const payment = useMutation({
    async mutationFn() {
      if (!stripe || !elements) throw new Error('Stripe not loaded.')
      const result = await stripe.confirmPayment({
        confirmParams: { return_url: window.location.href },
        elements,
        redirect: 'if_required',
      })
      if (result.error) throw new Error(result.error.message ?? 'Payment failed.')
    },
    onSuccess() {
      void deletePayment({ data: { id: props.id } })
      if (props.next) router.navigate({ to: props.next })
    },
  })

  return (
    <PageWrapper title="Add Credits" description="Add prepaid credits to your account.">
      {payment.isSuccess && !props.next ? (
        <p className="text-green9 border-green-a3 flex h-11 items-center gap-2 border px-3 text-sm">
          <IconOcticonCheck16 />
          Payment successful
        </p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            payment.mutate()
          }}
        >
          {props.locked ? (
            <div className="border-gray-a3 bg-gray-a1/50 flex h-11 items-center justify-between border px-3 text-sm">
              <span className="text-gray10 font-semibold">Amount: ${amount / 100}</span>
              <span className="text-gray8 text-sm">~{estimateRequests(amount * 10)} requests</span>
            </div>
          ) : (
            <RadioGroup
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              disabled={updateAmount.isPending}
              onValueChange={(value) => updateAmount.mutate(Number(value))}
              value={String(amount)}
            >
              {amounts.map((amount) => (
                <Radio.Root
                  className="group border-gray-a3 data-[checked]:border-gray10 bg-gray-a1/50 flex h-11 items-center justify-between border px-3 text-sm select-none disabled:opacity-50"
                  key={amount}
                  value={String(amount)}
                >
                  <span className="text-gray10 font-semibold">${amount / 100}</span>
                  <span className="text-gray8 text-xs">
                    ~{estimateRequests(amount * 10)} requests
                  </span>
                </Radio.Root>
              ))}
            </RadioGroup>
          )}
          <PaymentElement
            options={{
              layout: {
                defaultCollapsed: true,
                radios: false,
                type: 'accordion',
                visibleAccordionItemsCount: 2,
              },
            }}
          />
          <button
            className="bg-gray10 text-bg1 flex h-11 items-center justify-center px-4 transition-opacity hover:opacity-90 data-[submitting]:opacity-50"
            data-submitting={payment.isPending ? '' : undefined}
            disabled={!stripe || payment.isPending || updateAmount.isPending}
            type="submit"
          >
            {payment.isPending ? 'Processing' : 'Pay'}
          </button>
          {payment.error && <p className="text-red9 -mt-1 text-sm">{payment.error.message}</p>}
        </form>
      )}
    </PageWrapper>
  )
}

function PageWrapper(props: React.PropsWithChildren<{ description: string; title: string }>) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <Nav.Root fixed />
      <main className="flex flex-1 flex-col items-center px-6 pt-48 pb-32">
        <div className="flex w-full flex-col sm:max-w-sm">
          <h1 className="text-lg font-bold">{props.title}</h1>
          <p className="text-gray8 mt-2 mb-6 text-sm leading-relaxed">{props.description}</p>
          {props.children}
        </div>
      </main>
    </div>
  )
}

const paymentInput = z.object({ id: z.string() })

const getPayment = createServerFn({ method: 'GET' })
  .inputValidator((data) => z.parse(paymentInput, data))
  .handler(async (c) => {
    const data = await env.KV.get(`payment:${c.data.id}`, 'json')
    if (!data) return null
    return { ...data, publishable_key: env.STRIPE_PUBLISHABLE_KEY }
  })

const allowedAmounts = new Set(amounts)

const changeAmount = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.parse(z.object({ id: z.string(), amount: z.number() }), data))
  .handler(async (c) => {
    if (!allowedAmounts.has(c.data.amount)) throw new Error('invalid_amount')
    const data = await env.KV.get(`payment:${c.data.id}`, 'json')
    if (!data || data.locked) throw new Error('not_found')
    const url = new URL(env.STRIPE_API_URL)
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      host: url.hostname,
      port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
    })
    const piId = data.pi_secret.slice(0, data.pi_secret.indexOf('_secret_'))
    await stripe.paymentIntents.update(piId, { amount: c.data.amount })
    await env.KV.put(`payment:${c.data.id}`, JSON.stringify({ ...data, amount: c.data.amount }), {
      expirationTtl: 1800,
    })
  })

const deletePayment = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.parse(paymentInput, data))
  .handler(async (c) => {
    await env.KV.delete(`payment:${c.data.id}`)
  })
