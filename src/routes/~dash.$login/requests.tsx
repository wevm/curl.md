import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/~dash/$login/requests')({
  component: Requests,
})

function Requests() {
  return <h1 className="text-lg font-bold">Requests</h1>
}
