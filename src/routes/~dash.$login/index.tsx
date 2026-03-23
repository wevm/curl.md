import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/~dash/$login/')({
  component: Overview,
})

function Overview() {
  return <h1 className="text-lg font-bold">Overview</h1>
}
