import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { Dialog } from '#components/Dialog.tsx'
import { stripeAppearance } from '#components/stripe.ts'
import { useTheme } from '#hooks/useTheme.ts'
import { maxSavedPaymentMethods } from '#lib/constants.ts'
import { getBillingData, setupPaymentMethod } from '#server/billing.ts'

export const Route = createFileRoute('/_dash/$login/billing/add_payment_method')({
  async beforeLoad({ context, params }) {
    const billing = await getBillingData({
      data: { entityId: context.entity.id, entityType: context.entity.type },
    })
    if (billing.payment_methods.length >= maxSavedPaymentMethods)
      throw redirect({ params: { login: params.login }, to: '/$login/billing' })
  },
  component: Component,
})

function Component() {
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
          <Dialog.Title>Add payment method</Dialog.Title>
          <SetupFormLoader
            entityId={entity.id}
            entityType={entity.type}
            login={entity.login}
            onSuccess={() => {
              void queryClient.invalidateQueries({ queryKey: ['dashboard-billing', entity.id] })
              navigate({ params: { login: entity.login }, to: '/$login/billing' })
            }}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function SetupFormLoader(props: {
  entityId: string
  entityType: 'account' | 'organization'
  login: string
  onSuccess: () => void
}) {
  const [isSaving, setIsSaving] = React.useState(false)
  const setup = useMutation({
    mutationFn: () =>
      setupPaymentMethod({ data: { entityId: props.entityId, entityType: props.entityType } }),
  })

  React.useEffect(() => {
    setup.mutate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-64 flex-col gap-4">
      <div className="min-h-48">
        {setup.isError ? (
          <p className="text-red9 text-sm">{setup.error.message}</p>
        ) : setup.data && (!setup.data.client_secret || !setup.data.publishable_key) ? (
          <p className="text-red9 text-sm">Failed to initialize payment form.</p>
        ) : !setup.data ? null : (
          <SetupForm
            clientSecret={setup.data.client_secret}
            login={props.login}
            onSuccess={props.onSuccess}
            onSavingChange={setIsSaving}
            publishableKey={setup.data.publishable_key}
          />
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Dialog.Close className="text-gray9 hover:bg-gray-a2 px-3 py-1.5 text-sm">
          Cancel
        </Dialog.Close>
        <button
          className="bg-gray10 text-bg1 px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={!setup.data || isSaving}
          form="setup-payment-method"
          type="submit"
        >
          {isSaving ? 'Saving' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function SetupForm(props: {
  clientSecret: string
  login: string
  onSuccess: () => void
  onSavingChange: (saving: boolean) => void
  publishableKey: string
}) {
  const { resolvedTheme } = useTheme()
  const stripePromise = React.useMemo(
    () => loadStripe(props.publishableKey),
    [props.publishableKey],
  )

  return (
    <Elements
      options={{
        appearance: stripeAppearance(resolvedTheme),
        clientSecret: props.clientSecret,
      }}
      stripe={stripePromise}
    >
      <SetupFormInner
        login={props.login}
        onSavingChange={props.onSavingChange}
        onSuccess={props.onSuccess}
      />
    </Elements>
  )
}

function SetupFormInner(props: {
  login: string
  onSavingChange: (saving: boolean) => void
  onSuccess: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()

  const confirm = useMutation({
    async mutationFn() {
      if (!stripe || !elements) throw new Error('Stripe not loaded.')
      const result = await stripe.confirmSetup({
        confirmParams: {
          payment_method_data: { allow_redisplay: 'always' },
          return_url: buildAddPaymentMethodReturnUrl(props.login),
        },
        elements,
        redirect: 'if_required',
      })
      if (result.error) throw new Error(result.error.message ?? 'Setup failed.')
    },
    onSuccess() {
      props.onSuccess()
    },
  })

  React.useEffect(() => {
    props.onSavingChange(confirm.isPending)
    return () => props.onSavingChange(false)
  }, [confirm.isPending, props.onSavingChange])

  return (
    <form
      id="setup-payment-method"
      onSubmit={(e) => {
        e.preventDefault()
        confirm.mutate()
      }}
    >
      <PaymentElement
        options={{
          layout: { defaultCollapsed: false, type: 'tabs' },
          wallets: { link: 'never' },
        }}
      />
      {confirm.isError && <p className="text-red9 mt-2 text-sm">{confirm.error.message}</p>}
    </form>
  )
}

function buildAddPaymentMethodReturnUrl(login: string) {
  return new URL(
    `/${encodeURIComponent(login)}/billing/add_payment_method`,
    window.location.origin,
  ).toString()
}
