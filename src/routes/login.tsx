import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { createClient } from '#db/client.ts'
import * as Cookie from '#lib/cookie.ts'

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

const getSessionLogin = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const db = createClient(env.DB.connectionString)
  const sessionId = await Cookie.parseSigned(
    request.headers.get('cookie') ?? '',
    env.COOKIE_SECRET,
    'curl.session',
  )
  const accountId = sessionId
    ? ((
        await db
          .selectFrom('session')
          .where('id', '=', sessionId)
          .where('expires_at', '>', new Date())
          .select('account_id')
          .executeTakeFirst()
      )?.account_id ?? null)
    : null
  if (!accountId) return null

  const account = await db
    .selectFrom('account')
    .where('id', '=', accountId)
    .select('login')
    .executeTakeFirst()

  return account?.login ?? null
})
