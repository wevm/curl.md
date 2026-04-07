import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import * as React from 'react'
import { Dialog } from '#components/Dialog.tsx'
import { stripeAppearance } from '#components/stripe.ts'
import { useTheme } from '#hooks/useTheme.ts'
import { estimateRequests } from '#lib/format.ts'
import { deletePayment, getPayment } from '#server/billing.ts'

export const Route = createFileRoute('/_dash/$login/billing/add_credits/$paymentId')({
  component: Component,
})

function Component() {
  const { paymentId } = Route.useParams()
  const { entity } = Route.useRouteContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) navigate({ params: { login: entity.login }, to: '/$login/billing' })
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.CloseX />
          <Dialog.Title>Add credits</Dialog.Title>
          <Dialog.Description>Add prepaid credits to your account.</Dialog.Description>
          <AddCreditsDialogLoader
            login={entity.login}
            onSuccess={(amount) => {
              void queryClient.invalidateQueries({ queryKey: ['dashboard-billing', entity.id] })
              void queryClient.invalidateQueries({ queryKey: ['transactions', entity.id] })
              navigate({
                params: { login: entity.login },
                search: { notice: 'credits_added', notice_amount: amount },
                to: '/$login/billing',
              })
            }}
            paymentId={paymentId}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function AddCreditsDialogLoader(props: {
  login: string
  onSuccess: (amount: number) => void
  paymentId: string
}) {
  const fetchPayment = useServerFn(getPayment)
  const { data, error, isPending } = useQuery({
    queryKey: ['payment', props.paymentId],
    queryFn: () => fetchPayment({ data: { id: props.paymentId } }),
    retry: false,
  })
  const { resolvedTheme } = useTheme()
  const stripePromise = React.useMemo(
    () => (data ? loadStripe(data.publishable_key) : null),
    [data?.publishable_key, data],
  )

  if (isPending) return <p className="text-gray8 text-sm">Loading payment form...</p>

  if (!data || !stripePromise)
    return <p className="text-red9 text-sm">Payment session expired or not found.</p>

  return (
    <Elements
      options={{
        appearance: stripeAppearance(resolvedTheme),
        clientSecret: data.pi_secret,
        ...(data.cs_secret ? { customerSessionClientSecret: data.cs_secret } : {}),
      }}
      stripe={stripePromise}
    >
      {data.saved_payment_methods_unavailable && (
        <div className="text-yellow11 bg-yellow-a2 border-yellow-a4 flex items-start gap-2 border px-3 py-2 text-sm">
          <IconOcticonAlert16 aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Saved payment methods unavailable</p>
            <p>
              Saved payment methods are temporarily unavailable for this payment. You can still use
              a new payment method below.
            </p>
          </div>
        </div>
      )}
      <AddCreditsForm
        amount={data.amount}
        id={props.paymentId}
        login={props.login}
        onSuccess={props.onSuccess}
      />
      {error && <p className="text-red9 -mt-1 text-sm">{error.message}</p>}
    </Elements>
  )
}

function AddCreditsForm(props: {
  amount: number
  id: string
  login: string
  onSuccess: (amount: number) => void
}) {
  const stripe = useStripe()
  const elements = useElements()

  const payment = useMutation({
    async mutationFn() {
      if (!stripe || !elements) throw new Error('Stripe not loaded.')
      const result = await stripe.confirmPayment({
        confirmParams: { return_url: buildAddCreditsReturnUrl(props.login, props.id) },
        elements,
        redirect: 'if_required',
      })
      if (result.error) throw new Error(result.error.message ?? 'Payment failed.')
    },
    onSuccess() {
      void deletePayment({ data: { id: props.id } })
      props.onSuccess(props.amount)
    },
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        payment.mutate()
      }}
    >
      <div className="border-gray-a3 bg-gray-a1/50 flex h-11 items-center justify-between border px-3 text-sm">
        <span className="text-gray10 font-semibold">Amount: ${props.amount / 100}</span>
        <span className="text-gray8 text-sm">~{estimateRequests(props.amount * 10)} requests</span>
      </div>
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
        disabled={!stripe || payment.isPending}
        type="submit"
      >
        {payment.isPending ? 'Processing' : 'Pay'}
      </button>
      {payment.error && <p className="text-red9 -mt-1 text-sm">{payment.error.message}</p>}
    </form>
  )
}

function buildAddCreditsReturnUrl(login: string, paymentId: string) {
  return new URL(
    `/${encodeURIComponent(login)}/billing/add_credits/${encodeURIComponent(paymentId)}`,
    window.location.origin,
  ).toString()
}
