import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/~dash/$login/settings/general')({
  component: General,
})

function General() {
  return <h1 className="text-lg font-bold">General</h1>
}
