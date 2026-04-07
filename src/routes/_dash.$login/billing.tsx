import { Menu } from '@base-ui/react/menu'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import * as React from 'react'
import { z } from 'zod/v4'
import { Dashboard } from '#components/Dashboard.tsx'
import { creditAmounts, maxSavedPaymentMethods } from '#lib/constants.ts'
import { estimateRequests, formatMills } from '#lib/format.ts'
import { rpc } from '#lib/rpc.ts'
import { getBillingData, getTransactions, setDefaultPaymentMethod } from '#server/billing.ts'

const PAGE_SIZE = 10
const checkoutRefreshDuration = 20_000
const searchSchema = z.object({
  notice: z.enum(['credits_added']).optional(),
  notice_amount: z.coerce.number().optional(),
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
  const search = Route.useSearch()
  const navigate = useNavigate()
  const fetchBilling = useServerFn(getBillingData)
  const queryClient = useQueryClient()
  const [refreshAfterCheckout, setRefreshAfterCheckout] = React.useState(false)
  const [addCreditsNotice, setAddCreditsNotice] = React.useState<{
    kind: 'error' | 'success'
    message: string
  } | null>(null)

  React.useEffect(() => {
    if (!refreshAfterCheckout) return

    const timeout = window.setTimeout(() => setRefreshAfterCheckout(false), checkoutRefreshDuration)
    return () => window.clearTimeout(timeout)
  }, [refreshAfterCheckout])

  React.useEffect(() => {
    if (search.notice !== 'credits_added' || search.notice_amount === undefined) return

    setAddCreditsNotice({
      kind: 'success',
      message: `Payment successful. $${formatMills(search.notice_amount * 10)} in credits will update shortly.`,
    })
    setRefreshAfterCheckout(true)
    navigate({ params: { login: entity.login }, replace: true, search: {}, to: '/$login/billing' })
  }, [entity.login, navigate, search.notice, search.notice_amount])

  const { data } = useQuery({
    initialData: loaderData.billing,
    queryKey: ['dashboard-billing', entity.id],
    queryFn: () => fetchBilling({ data: { entityId: entity.id, entityType: entity.type } }),
    refetchInterval: refreshAfterCheckout ? 2_000 : 10_000,
    refetchOnMount: 'always',
  })
  const hasReachedPaymentMethodLimit = data.payment_methods.length >= maxSavedPaymentMethods

  const refreshBilling = React.useCallback(() => {
    setRefreshAfterCheckout(true)
    void queryClient.invalidateQueries({ queryKey: ['dashboard-billing', entity.id] })
    void queryClient.invalidateQueries({ queryKey: ['transactions', entity.id] })
  }, [entity.id, queryClient])

  const openCreditsDialog = React.useCallback(
    (paymentId: string) =>
      navigate({
        params: { login: entity.login, paymentId },
        to: '/$login/billing/add_credits/$paymentId',
      }),
    [entity.login, navigate],
  )

  const openSetupDialog = React.useCallback(
    () => navigate({ params: { login: entity.login }, to: '/$login/billing/add_payment_method' }),
    [entity.login, navigate],
  )

  const openRemoveDialog = React.useCallback(
    (paymentMethodId: string) =>
      navigate({
        params: { login: entity.login, paymentMethodId },
        to: '/$login/billing/remove_payment_method/$paymentMethodId',
      }),
    [entity.login, navigate],
  )

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
                                disabled={setDefault.isPending}
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
                            disabled={setDefault.isPending}
                            onClick={() => openRemoveDialog(pm.id)}
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
            onClick={openSetupDialog}
            type="button"
          >
            Add payment method
          </button>
        )}
        {setDefault.isError && <p className="text-red9 mt-2 text-sm">{setDefault.error.message}</p>}
      </Dashboard.Section>

      <TransactionHistory
        balanceMills={data.balance_mills}
        entityId={entity.id}
        entityType={entity.type}
        initialData={loaderData.transactions}
        refreshAfterCheckout={refreshAfterCheckout}
        timezone={data.timezone}
      />

      <Outlet />
    </Dashboard.Content>
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
