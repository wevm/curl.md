import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Dialog } from '#components/Dialog.tsx'
import { getBillingData, removePaymentMethod } from '#server/billing.ts'

export const Route = createFileRoute(
  '/_dash/$login/billing/remove_payment_method/$paymentMethodId',
)({
  async loader({ context, params }) {
    const billing = await getBillingData({
      data: { entityId: context.entity.id, entityType: context.entity.type },
    })
    const paymentMethod = billing.payment_methods.find((pm) => pm.id === params.paymentMethodId)
    if (!paymentMethod) throw redirect({ params: { login: params.login }, to: '/$login/billing' })
    return paymentMethod
  },
  component: Component,
})

function Component() {
  const paymentMethod = Route.useLoaderData()
  const { entity } = Route.useRouteContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () =>
      removePaymentMethod({
        data: {
          entityId: entity.id,
          entityType: entity.type,
          paymentMethodId: paymentMethod.id,
        },
      }),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['dashboard-billing', entity.id] })
      navigate({ params: { login: entity.login }, to: '/$login/billing' })
    },
  })

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !remove.isPending)
          navigate({ params: { login: entity.login }, to: '/$login/billing' })
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
              {paymentMethod.brand} &bull;&bull;&bull;&bull; {paymentMethod.last4}
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
              onClick={() => remove.mutate()}
              type="button"
            >
              {remove.isPending ? 'Removing' : 'Remove'}
            </button>
          </div>
          {remove.isError && <p className="text-red9 mt-2 text-sm">{remove.error.message}</p>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
