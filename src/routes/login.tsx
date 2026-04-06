import { createFileRoute, redirect } from '@tanstack/react-router'
import { hc } from 'hono/client'
import { z } from 'zod'
import type { api } from '#api.ts'
import { Nav } from '#components/Nav.tsx'
import { getSessionLogin } from '#server/session.ts'

export const Route = createFileRoute('/login')({
  head() {
    return { meta: [{ title: `Sign In - ${__HOST__}` }] }
  },
  validateSearch: z.object({ next: z.string().optional() }),
  async beforeLoad() {
    const login = await getSessionLogin()
    if (login) throw redirect({ to: '/$login', params: { login } })
  },
  component: Component,
})

function Component() {
  const search = Route.useSearch()
  const href = (() => {
    const isPreview = __HOST__ !== 'curl.md' && __HOST__ !== 'curl.local'
    const rpc = hc<typeof api>(isPreview ? 'https://curl.md' : __ORIGIN__)
    const next = isPreview
      ? search.next
        ? `${__ORIGIN__}${search.next}`
        : __ORIGIN__
      : search.next
    const url = rpc.api.auth.github.$url(next ? { query: { next } } : undefined)
    if (isPreview) return url.toString()
    return url.pathname + url.search
  })()
  return (
    <div className="relative flex min-h-dvh flex-col">
      <Nav.Root fixed />
      <main className="flex flex-1 flex-col items-center px-6 pt-48 pb-32">
        <div className="flex w-full flex-col sm:max-w-sm">
          <h1 className="text-lg font-bold">Sign in</h1>
          <p className="text-gray8 mt-2 text-sm leading-relaxed">
            New to curl.md or been here before? Continue below to start curling.
          </p>
          <a
            className="bg-gray10 text-bg1 mt-6 flex h-11 w-full items-center justify-center gap-2 px-4 transition-opacity hover:opacity-90"
            href={href}
          >
            <IconOcticonMarkGithub16 className="size-5" />
            Continue with GitHub
          </a>
        </div>
      </main>
    </div>
  )
}
