import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import * as React from 'react'
import Stripe from 'stripe'
import { z } from 'zod/mini'
import { creditAmounts } from '#lib/constants.ts'

export const Route = createFileRoute('/credits/add/$id')({
  head() {
    return { meta: [{ title: 'Add Credits' }] }
  },
  loader: ({ params }) => getPayment({ data: { id: params.id } }),
  component: AddCreditsPage,
})

function AddCreditsPage() {
  const { id } = Route.useParams()
  const data = Route.useLoaderData()

  const stripePromise = React.useMemo(
    () => (data ? loadStripe(data.publishable_key) : null),
    [data?.publishable_key, data],
  )

  if (!data || !stripePromise)
    return (
      <PageWrapper>
        <p className="text-gray9 dark:text-gray6">Payment session not found or expired.</p>
      </PageWrapper>
    )

  return (
    <PageWrapper>
      <Elements
        options={{
          appearance: {
            theme: 'stripe',
            variables: {
              fontFamily: '"Geist Mono Variable", monospace',
              fontSizeBase: '14px',
            },
          },
          clientSecret: data.pi_secret,
          customerSessionClientSecret: data.cs_secret,
        }}
        stripe={stripePromise}
      >
        <CheckoutForm amount={data.amount} id={id} locked={data.locked} />
      </Elements>
    </PageWrapper>
  )
}

const amounts = creditAmounts.map(Number)

function CheckoutForm(props: { amount: number; id: string; locked: boolean }) {
  const stripe = useStripe()
  const elements = useElements()
  const [amount, setAmount] = React.useState(props.amount)

  const updateAmount = useMutation({
    async mutationFn(newAmount: number) {
      await changeAmount({ data: { id: props.id, amount: newAmount } })
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
    },
  })

  if (payment.isSuccess)
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <IconLucideCircleCheck className="text-green9 size-12" />
        <p className="text-lg font-bold">Payment successful!</p>
        <p className="text-gray9 dark:text-gray6">You can close this page.</p>
      </div>
    )

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        payment.mutate()
      }}
    >
      {props.locked ? (
        <p className="text-gray9 dark:text-gray6">Amount: ${(amount / 100).toFixed(2)}</p>
      ) : (
        <div className="flex gap-2">
          {amounts.map((a) => (
            <button
              className="border-gray-a2 data-[active]:border-gray10 data-[active]:bg-gray10 data-[active]:text-bg1 flex-1 rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              data-active={a === amount ? '' : undefined}
              disabled={updateAmount.isPending}
              key={a}
              onClick={() => updateAmount.mutate(a)}
              type="button"
            >
              ${a / 100}
            </button>
          ))}
        </div>
      )}
      <PaymentElement />
      {payment.error ? <p className="text-red9 text-xs">{payment.error.message}</p> : null}
      <button
        className="bg-gray10 text-bg1 rounded px-4 py-2 hover:opacity-90 disabled:opacity-50"
        disabled={!stripe || payment.isPending || updateAmount.isPending}
        type="submit"
      >
        {payment.isPending ? 'Processing...' : `Pay $${(amount / 100).toFixed(2)}`}
      </button>
    </form>
  )
}

function PageWrapper(props: React.PropsWithChildren) {
  const { children } = props
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <div className="border-gray-a2 w-full rounded-lg border p-6">
        <h1 className="mb-4 text-lg font-bold">Add Credits</h1>
        {children}
      </div>
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
    const stripe = new Stripe(env.STRIPE_SECRET_KEY)
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
