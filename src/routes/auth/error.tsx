import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Nav } from '#components/Nav.tsx'

export const Route = createFileRoute('/auth/error')({
  head() {
    return {
      meta: [{ title: `Auth Error - ${__HOST__}` }],
    }
  },
  validateSearch: z.object({
    error: z.string(),
    error_description: z.string(),
  }),
  component: Component,
})

function Component() {
  const search = Route.useSearch()
  return (
    <div className="relative flex min-h-dvh flex-col">
      <Nav.Root fixed />
      <main className="flex flex-1 flex-col items-center px-6 pt-48 pb-32">
        <div className="flex w-full flex-col sm:max-w-sm">
          <h1 className="text-lg font-bold capitalize">{search.error.replace(/[_-]/g, ' ')}</h1>
          <p className="text-gray8 mt-2 text-sm leading-relaxed">{search.error_description}</p>
          <a
            className="bg-gray10 text-bg1 mt-6 flex h-11 w-full items-center justify-center gap-2 px-4 transition-opacity hover:opacity-90"
            href="/login"
          >
            Try again
          </a>
        </div>
      </main>
    </div>
  )
}
