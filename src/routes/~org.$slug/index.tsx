import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/~org/$slug/')({
  component: Dashboard,
})

function Dashboard() {
  const { organization } = Route.useRouteContext()
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-bold text-lg">Dashboard</h1>
      <p className="text-gray9 dark:text-gray6">
        Usage overview for {organization.name}
      </p>
    </div>
  )
}
