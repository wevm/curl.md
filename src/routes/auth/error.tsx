import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

export const Route = createFileRoute('/auth/error')({
  component: AuthError,
  head: () => ({
    meta: [{ title: `Auth Error - ${__HOST__}` }],
  }),
  validateSearch: z.object({
    error: z.string(),
    error_description: z.string(),
  }),
})

function AuthError() {
  const { error, error_description } = Route.useSearch()

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <h1 className="font-bold text-lg">{error}</h1>
      <p className="mt-2 text-gray11">{error_description}</p>
      <a className="mt-6 text-gray11 underline hover:text-gray12" href="/login">
        Try again
      </a>
    </div>
  )
}
