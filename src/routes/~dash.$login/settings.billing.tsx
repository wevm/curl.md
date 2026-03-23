import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/~dash/$login/settings/billing')({
  component: Billing,
})

function Billing() {
  return <h1 className="text-lg font-bold">Billing</h1>
}
