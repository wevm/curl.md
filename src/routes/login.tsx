import { env } from 'cloudflare:workers'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { getDb } from '#lib/db.ts'
import * as Session from '#lib/session.ts'

export const Route = createFileRoute('/login')({
  head: () => ({
    meta: [{ title: `Sign In - ${__HOST__}` }],
  }),
  validateSearch: z.object({ next: z.string().optional() }),
  beforeLoad: async () => {
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
      <h1 className="font-bold text-lg">Sign in to {__HOST__}</h1>
      <a
        className="mt-6 flex items-center gap-2 bg-gray12 px-4 py-2 text-gray1 hover:bg-gray11"
        href={href}
      >
        <IconOcticonMarkGithub16 className="size-5" />
        Continue with GitHub
      </a>
    </div>
  )
}

const getSessionLogin = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const db = getDb(env.DB.connectionString)
  const accountId = await Session.getAccountId(request, db, env.COOKIE_SECRET)
  if (!accountId) return null

  const account = await db
    .selectFrom('account')
    .where('id', '=', accountId)
    .select('login')
    .executeTakeFirst()

  return account?.login ?? null
})
