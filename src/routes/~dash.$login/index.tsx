import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/~dash/$login/')({
  component: Dashboard,
})

function Dashboard() {
  const { entity } = Route.useRouteContext()
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-bold text-lg">Dashboard</h1>
      <p className="text-gray9 dark:text-gray6">
        Usage overview for {entity.name ?? entity.login}
      </p>
    </div>
  )
}
