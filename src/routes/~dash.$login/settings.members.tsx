import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/~dash/$login/settings/members')({
  component: Members,
})

function Members() {
  return <h1 className="text-lg font-bold">Members</h1>
}
