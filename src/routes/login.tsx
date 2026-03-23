import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { getSessionLogin } from '#server/session.ts'

export const Route = createFileRoute('/login')({
  head() {
    return { meta: [{ title: `Sign In - ${__HOST__}` }] }
  },
  validateSearch: z.object({ next: z.string().optional() }),
  async beforeLoad() {
    const login = await getSessionLogin()
    if (login) throw redirect({ to: '/~dash/$login', params: { login } })
  },
  component: Login,
})

function Login() {
  const { next } = Route.useSearch()
  const isPreview = __HOST__ !== 'curl.md' && __HOST__ !== 'curl.local'
  const href = isPreview
    ? `https://curl.md/api/auth/github?next=${encodeURIComponent(next ? `https://${__HOST__}${next}` : `https://${__HOST__}`)}`
    : next
      ? `/api/auth/github?next=${encodeURIComponent(next)}`
      : '/api/auth/github'
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <h1 className="text-lg font-bold">Sign in to {__HOST__}</h1>
      <a
        className="bg-gray12 text-gray1 hover:bg-gray11 mt-6 flex items-center gap-2 px-4 py-2"
        href={href}
      >
        <IconOcticonMarkGithub16 className="size-5" />
        Continue with GitHub
      </a>
    </div>
  )
}
