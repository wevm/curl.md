import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/~dash/$login/settings/tokens')({
  component: Tokens,
})

function Tokens() {
  return <h1 className="text-lg font-bold">Tokens</h1>
}
