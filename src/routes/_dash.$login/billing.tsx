import { Menu } from '@base-ui/react/menu'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import * as React from 'react'
import { z } from 'zod/v4'
import { Dashboard } from '#components/Dashboard.tsx'
import { Dialog } from '#components/Dialog.tsx'
import { stripeAppearance } from '#components/stripe.ts'
import { useTheme } from '#hooks/useTheme.ts'
import { creditAmounts, maxSavedPaymentMethods } from '#lib/constants.ts'
import { estimateRequests, formatMills } from '#lib/format.ts'
import { rpc } from '#lib/rpc.ts'
import {
  deletePayment,
  getBillingData,
  getPayment,
  getTransactions,
  removePaymentMethod,
  setDefaultPaymentMethod,
  setupPaymentMethod,
  type PaymentMethod,
} from '#server/billing.ts'

const PAGE_SIZE = 10
const checkoutRefreshDuration = 20_000
const searchSchema = z.object({
  modal: z.enum(['add_credits', 'add_payment_method']).optional(),
  payment_id: z.string().optional(),
})

export const Route = createFileRoute('/_dash/$login/billing')({
  head: () => ({ meta: [{ title: `Billing - ${__HOST__}` }] }),
  validateSearch: searchSchema,
  async loader({ context }) {
    const [billing, transactions] = await Promise.all([
      getBillingData({ data: { entityId: context.entity.id, entityType: context.entity.type } }),
      getTransactions({
        data: {
          entityId: context.entity.id,
          entityType: context.entity.type,
          limit: PAGE_SIZE,
          offset: 0,
        },
      }),
    ])
    return { billing, transactions }
  },
  component: Component,
})

function Component() {
  const { entity } = Route.useRouteContext()
  const loaderData = Route.useLoaderData()
  const { modal, payment_id } = Route.useSearch()
  const navigate = useNavigate()
  const fetchBilling = useServerFn(getBillingData)
  const queryClient = useQueryClient()
  const [refreshAfterCheckout, setRefreshAfterCheckout] = React.useState(false)

  React.useEffect(() => {
    if (!refreshAfterCheckout) return

    const timeout = window.setTimeout(() => setRefreshAfterCheckout(false), checkoutRefreshDuration)
    return () => window.clearTimeout(timeout)
  }, [refreshAfterCheckout])

  const { data } = useQuery({
    initialData: loaderData.billing,
    queryKey: ['dashboard-billing', entity.id],
    queryFn: () => fetchBilling({ data: { entityId: entity.id, entityType: entity.type } }),
    refetchInterval: refreshAfterCheckout ? 2_000 : 10_000,
    refetchOnMount: 'always',
  })
  const hasReachedPaymentMethodLimit = data.payment_methods.length >= maxSavedPaymentMethods

  React.useEffect(() => {
    if (!hasReachedPaymentMethodLimit || modal !== 'add_payment_method') return

    navigate({
      from: '/$login/billing',
      replace: true,
      search: (prev) => ({ ...prev, modal: undefined, payment_id: undefined }),
    })
  }, [hasReachedPaymentMethodLimit, modal, navigate])

  const addCreditsOpen = modal === 'add_credits' && Boolean(payment_id)
  const setupOpen = modal === 'add_payment_method' && !hasReachedPaymentMethodLimit

  const refreshBilling = React.useCallback(() => {
    setRefreshAfterCheckout(true)
    void queryClient.invalidateQueries({ queryKey: ['dashboard-billing', entity.id] })
    void queryClient.invalidateQueries({ queryKey: ['transactions', entity.id] })
  }, [entity.id, queryClient])

  const openCreditsDialog = React.useCallback(
    (nextPaymentId: string) => {
      navigate({
        from: '/$login/billing',
        search: (prev) => ({ ...prev, modal: 'add_credits', payment_id: nextPaymentId }),
      })
    },
    [navigate],
  )

  const closeCreditsDialog = React.useCallback(
    () =>
      navigate({
        from: '/$login/billing',
        search: (prev) => ({ ...prev, modal: undefined, payment_id: undefined }),
      }),
    [navigate],
  )

  const setSetupOpen = React.useCallback(
    (open: boolean) =>
      navigate({
        from: '/$login/billing',
        search: (prev) => ({
          ...prev,
          modal: open ? 'add_payment_method' : undefined,
          payment_id: undefined,
        }),
      }),
    [navigate],
  )

  const [deleteTarget, setDeleteTarget] = React.useState<PaymentMethod | null>(null)
  const [addCreditsNotice, setAddCreditsNotice] = React.useState<{
    kind: 'error' | 'success'
    message: string
  } | null>(null)

  const remove = useMutation({
    mutationFn: (paymentMethodId: string) =>
      removePaymentMethod({
        data: { entityId: entity.id, entityType: entity.type, paymentMethodId },
      }),
    onSuccess() {
      setDeleteTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['dashboard-billing', entity.id] })
    },
  })

  const setDefault = useMutation({
    mutationFn: (paymentMethodId: string) =>
      setDefaultPaymentMethod({
        data: { entityId: entity.id, entityType: entity.type, paymentMethodId },
      }),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['dashboard-billing', entity.id] })
    },
  })

  const addCredits = useMutation({
    async mutationFn(amount: (typeof creditAmounts)[number]) {
      if (data.payment_methods.length > 0) {
        const res = await rpc.api.credits.charge.$post({
          json: {
            amount,
            ...(entity.type === 'organization' ? { organization_id: entity.id } : {}),
          },
        })
        if (res.status === 200) return { kind: 'charge', result: await res.json() } as const

        if (res.status === 400) {
          const json = await res.json()
          if (json.code !== 'no_payment_method') throw new Error(json.message)
        } else {
          const json = await res.json()
          throw new Error(json.message)
        }
      }

      const res = await rpc.api.credits.add.$post({
        json: {
          amount,
          locked: true,
          ...(entity.type === 'organization' ? { organization_id: entity.id } : {}),
        },
      })
      if (res.status !== 200) {
        const json = await res.json()
        throw new Error(json.message)
      }

      return { kind: 'add', result: await res.json() } as const
    },
    onMutate() {
      setAddCreditsNotice(null)
    },
    onError(error) {
      setAddCreditsNotice({ kind: 'error', message: error.message })
    },
    onSuccess(data, amount) {
      if (data.kind === 'charge') {
        if (data.result.status === 'requires_action') {
          openCreditsDialog(data.result.payment_id)
          return
        }

        refreshBilling()
        setAddCreditsNotice({
          kind: 'success',
          message: `Payment successful. $${formatMills(Number(amount) * 10)} in credits will update shortly.`,
        })
        return
      }

      openCreditsDialog(data.result.payment_id)
    },
  })

  const balanceDollars = formatMills(data.balance_mills)
  const amounts = creditAmounts.map(Number)

  return (
    <Dashboard.Content>
      <Dashboard.Heading level={1}>Billing</Dashboard.Heading>

      <div className="grid gap-3 md:grid-cols-2">
        <Dashboard.Stat label="Credits Remaining" value={`$${balanceDollars}`} />
        <Dashboard.Stat
          label="Requests Remaining"
          value={data.balance_mills ? `~${estimateRequests(data.balance_mills)}` : undefined}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {amounts.map((amount) => (
          <button
            className="bg-gray10 text-bg1 px-3 py-1.5 text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={addCredits.isPending}
            key={amount}
            onClick={() => addCredits.mutate(String(amount) as (typeof creditAmounts)[number])}
            type="button"
          >
            Add ${amount / 100}
          </button>
        ))}
      </div>
      {addCreditsNotice && (
        <p
          className="data-[error]:text-red9 data-[success]:text-green9 mt-2 text-sm"
          data-error={addCreditsNotice.kind === 'error' ? '' : undefined}
          data-success={addCreditsNotice.kind === 'success' ? '' : undefined}
        >
          {addCreditsNotice.message}
        </p>
      )}

      <Dashboard.Section title="Payment Methods">
        {data.payment_methods.length > 0 ? (
          <div className="bg-gray-a1/50 border-gray3 border">
            {data.payment_methods.map((pm) => (
              <div
                className="border-gray3 flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0"
                key={pm.id}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <CardBrandIcon brand={pm.brand} />
                  <div className="min-w-0 text-sm">
                    <div className="truncate">
                      {!knownCardBrands.has(pm.brand) && (
                        <span className="font-medium capitalize">{pm.brand} </span>
                      )}
                      {pm.funding !== 'unknown' && (
                        <span className="text-gray8">{pm.funding} </span>
                      )}
                      <span className="text-gray8">&bull;&bull;&bull;&bull; {pm.last4}</span>
                      {pm.is_default && (
                        <span className="border-gray-a3 text-gray8 ms-2 inline-flex items-center border px-1 py-0.5 text-xs leading-none uppercase">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-gray8 md:hidden">
                      Valid until {pm.exp_month}/{String(pm.exp_year).slice(-2)}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-gray8 hidden text-sm md:inline">
                    Valid until {pm.exp_month}/{String(pm.exp_year).slice(-2)}
                  </span>
                  <Menu.Root>
                    <Menu.Trigger className="text-gray8 hover:bg-gray-a2 p-1">
                      <IconOcticonKebabHorizontal16 className="size-4" />
                    </Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Positioner align="end" sideOffset={4}>
                        <Menu.Popup className="bg-bg1 border-gray-a3 before:bg-gray-a1/50 relative min-w-36 border px-1 py-1 before:absolute before:inset-0 before:-z-1">
                          {!pm.is_default && (
                            <>
                              <Menu.Item
                                className="text-gray9 hover:bg-gray-a2 hover:text-gray10 flex items-center gap-2 p-1.5 text-sm disabled:opacity-30"
                                disabled={remove.isPending || setDefault.isPending}
                                onClick={() => setDefault.mutate(pm.id)}
                              >
                                {setDefault.isPending && setDefault.variables === pm.id
                                  ? 'Setting as default'
                                  : 'Set As Default'}
                              </Menu.Item>
                              <div className="border-gray-a2 -mx-1 my-1 border-t" />
                            </>
                          )}
                          <Menu.Item
                            className="text-red9 hover:bg-red2/80 flex items-center gap-2 p-1.5 text-sm"
                            disabled={remove.isPending || setDefault.isPending}
                            onClick={() => setDeleteTarget(pm)}
                          >
                            Remove
                          </Menu.Item>
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.Root>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {!hasReachedPaymentMethodLimit && (
          <button
            className="bg-gray10 text-bg1 self-start px-3 py-1.5 text-sm transition-opacity hover:opacity-90 data-[has-methods]:mt-3"
            data-has-methods={data.payment_methods.length > 0 ? '' : undefined}
            onClick={() => setSetupOpen(true)}
            type="button"
          >
            Add payment method
          </button>
        )}
        {setDefault.isError && <p className="text-red9 mt-2 text-sm">{setDefault.error.message}</p>}
        {remove.isError && <p className="text-red9 mt-2 text-sm">{remove.error.message}</p>}
      </Dashboard.Section>

      <TransactionHistory
        balanceMills={data.balance_mills}
        entityId={entity.id}
        entityType={entity.type}
        initialData={loaderData.transactions}
        refreshAfterCheckout={refreshAfterCheckout}
        timezone={data.timezone}
      />

      <Dialog.Root
        open={addCreditsOpen}
        onOpenChange={(open) => {
          if (!open) closeCreditsDialog()
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.CloseX />
            <Dialog.Title>Add credits</Dialog.Title>
            <Dialog.Description>Add prepaid credits to your account.</Dialog.Description>
            {payment_id && (
              <AddCreditsDialogLoader
                onSuccess={(amount) => {
                  refreshBilling()
                  setAddCreditsNotice({
                    kind: 'success',
                    message: `Payment successful. $${formatMills(amount * 10)} in credits will update shortly.`,
                  })
                  closeCreditsDialog()
                }}
                paymentId={payment_id}
              />
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={setupOpen}
        onOpenChange={(open) => {
          if (!open) setSetupOpen(false)
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.CloseX />
            <Dialog.Title>Add payment method</Dialog.Title>
            {setupOpen && (
              <SetupFormLoader
                entityId={entity.id}
                entityType={entity.type}
                onSuccess={() => {
                  setSetupOpen(false)
                  queryClient.invalidateQueries({ queryKey: ['dashboard-billing', entity.id] })
                }}
              />
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleteTarget(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.CloseX />
            <Dialog.Title>Remove payment method</Dialog.Title>
            <Dialog.Description>
              Are you sure you want to remove{' '}
              <span className="text-gray12 font-medium">
                {deleteTarget?.brand} &bull;&bull;&bull;&bull; {deleteTarget?.last4}
              </span>
              ? This action cannot be undone.
            </Dialog.Description>
            <div className="flex justify-end gap-2">
              <Dialog.Close
                className="text-gray9 hover:bg-gray-a2 px-3 py-1.5 text-sm"
                disabled={remove.isPending}
              >
                Cancel
              </Dialog.Close>
              <button
                className="bg-red9 text-bg1 px-3 py-1.5 text-sm disabled:opacity-50"
                disabled={remove.isPending}
                onClick={() => {
                  if (deleteTarget) remove.mutate(deleteTarget.id)
                }}
                type="button"
              >
                {remove.isPending ? 'Removing' : 'Remove'}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </Dashboard.Content>
  )
}

function AddCreditsDialogLoader(props: { onSuccess: (amount: number) => void; paymentId: string }) {
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
      <AddCreditsForm amount={data.amount} id={props.paymentId} onSuccess={props.onSuccess} />
      {error && <p className="text-red9 -mt-1 text-sm">{error.message}</p>}
    </Elements>
  )
}

function AddCreditsForm(props: {
  amount: number
  id: string
  onSuccess: (amount: number) => void
}) {
  const stripe = useStripe()
  const elements = useElements()

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

function SetupFormLoader(props: {
  entityId: string
  entityType: 'account' | 'organization'
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
      <SetupFormInner onSavingChange={props.onSavingChange} onSuccess={props.onSuccess} />
    </Elements>
  )
}

function SetupFormInner(props: {
  onSavingChange: (saving: boolean) => void
  onSuccess: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()

  const confirm = useMutation({
    async mutationFn() {
      if (!stripe || !elements) throw new Error('Stripe not loaded.')
      const returnUrl = new URL(window.location.href)
      returnUrl.searchParams.delete('modal')
      const result = await stripe.confirmSetup({
        confirmParams: {
          payment_method_data: { allow_redisplay: 'always' },
          return_url: returnUrl.toString(),
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

const knownCardBrands = new Set(['amex', 'diners', 'discover', 'jcb', 'mastercard', 'visa'])

function TransactionHistory(props: {
  balanceMills: number
  entityId: string
  entityType: 'account' | 'organization'
  initialData: Awaited<ReturnType<typeof getTransactions>>
  refreshAfterCheckout: boolean
  timezone?: string | undefined
}) {
  const [page, setPage] = React.useState(0)
  const fetchTransactions = useServerFn(getTransactions)

  React.useEffect(() => {
    if (!props.refreshAfterCheckout) return
    setPage(0)
  }, [props.refreshAfterCheckout])

  const { data } = useQuery({
    initialData: page === 0 ? props.initialData : undefined,
    queryKey: ['transactions', props.entityId, page],
    queryFn: () =>
      fetchTransactions({
        data: {
          entityId: props.entityId,
          entityType: props.entityType,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: page === 0 && props.refreshAfterCheckout ? 2_000 : false,
    refetchOnMount: 'always',
    retry: false,
    staleTime: props.refreshAfterCheckout ? 0 : 60_000,
  })

  if (!data || data.total === 0) return null

  const totalPages = Math.ceil(data.total / PAGE_SIZE)

  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-gray8 text-xs font-medium tracking-wide uppercase">History</h2>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            {page > 0 && (
              <button
                className="text-gray9 hover:bg-gray-a2 hover:text-gray12 p-0.5"
                onClick={() => setPage(page - 1)}
                type="button"
              >
                <IconOcticonChevronLeft16 className="size-3.5" />
              </button>
            )}
            <span className="text-gray8 text-xs tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <button
              className="text-gray9 hover:bg-gray-a2 hover:text-gray12 p-0.5 disabled:opacity-30"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
              type="button"
            >
              <IconOcticonChevronRight16 className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      <Dashboard.Table className="min-w-[36rem] table-fixed text-sm md:min-w-0">
        <colgroup>
          <col className="w-[48%]" />
          <col className="w-[18%]" />
          <col className="w-[17%]" />
          <col className="w-[17%]" />
        </colgroup>
        <Dashboard.Table.Thead>
          <Dashboard.Table.Th className="w-px whitespace-nowrap">Date</Dashboard.Table.Th>
          <Dashboard.Table.Th className="w-px whitespace-nowrap">Type</Dashboard.Table.Th>
          <Dashboard.Table.Th align="end">Amount</Dashboard.Table.Th>
          <Dashboard.Table.Th align="end" className="ps-6">
            Balance
          </Dashboard.Table.Th>
        </Dashboard.Table.Thead>
        <tbody>
          {data.transactions.map((tx, i) => {
            const balanceAfter =
              props.balanceMills -
              data.prior_sum -
              data.transactions.slice(0, i).reduce((sum, t) => sum + t.amount_mills, 0)
            return (
              <Dashboard.Table.Tr key={`${tx.created_at}-${i}`}>
                <Dashboard.Table.Td className="text-gray8 whitespace-nowrap">
                  <LocalTime timezone={props.timezone} value={tx.created_at} />
                </Dashboard.Table.Td>
                <Dashboard.Table.Td className="whitespace-nowrap capitalize">
                  {tx.type}
                </Dashboard.Table.Td>
                <Dashboard.Table.Td
                  className="data-[credit]:text-green9 data-[debit]:text-red9 text-end whitespace-nowrap tabular-nums"
                  data-credit={tx.amount_mills > 0 ? '' : undefined}
                  data-debit={tx.amount_mills < 0 ? '' : undefined}
                >
                  {tx.amount_mills >= 0 ? '+' : '-'}${formatMills(tx.amount_mills)}
                </Dashboard.Table.Td>
                <Dashboard.Table.Td className="text-gray8 ps-6 text-end whitespace-nowrap tabular-nums">
                  ${formatMills(balanceAfter)}
                </Dashboard.Table.Td>
              </Dashboard.Table.Tr>
            )
          })}
        </tbody>
      </Dashboard.Table>
    </section>
  )
}

function LocalTime(props: { timezone?: string | undefined; value: Date | string }) {
  return new Date(props.value).toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone: props.timezone ?? 'UTC',
    year: 'numeric',
  })
}

function CardBrandIcon(props: { brand: string }) {
  const className = 'size-8'
  switch (props.brand) {
    case 'amex':
      return (
        <IconSimpleIconsAmericanexpress
          aria-label="American Express"
          className={className}
          role="img"
        />
      )
    case 'diners':
      return <IconSimpleIconsDinersclub aria-label="Diners Club" className={className} role="img" />
    case 'discover':
      return <IconSimpleIconsDiscover aria-label="Discover" className={className} role="img" />
    case 'jcb':
      return <IconSimpleIconsJcb aria-label="JCB" className={className} role="img" />
    case 'mastercard':
      return <IconSimpleIconsMastercard aria-label="Mastercard" className={className} role="img" />
    case 'visa':
      return <IconSimpleIconsVisa aria-label="Visa" className={className} role="img" />
    default:
      return <IconOcticonCreditCard16 aria-hidden className={`text-gray8 ${className}`} />
  }
}
