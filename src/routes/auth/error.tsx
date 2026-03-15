import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

export const Route = createFileRoute('/auth/error')({
  component: AuthError,
  head() {
    return {
      meta: [{ title: `Auth Error - ${__HOST__}` }],
    }
  },
  validateSearch: z.object({
    error: z.string(),
    error_description: z.string(),
  }),
})

function AuthError() {
  const { error, error_description } = Route.useSearch()

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <h1 className="text-lg font-bold">{error}</h1>
      <p className="text-gray11 mt-2">{error_description}</p>
      <a className="text-gray11 hover:text-gray12 mt-6 underline" href="/login">
        Try again
      </a>
    </div>
  )
}
