import { useMutation } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { Nav } from '#components/Nav.tsx'
import { createClient } from '#db/client.ts'
import * as Cookie from '#lib/cookie.ts'
import { rpc } from '#lib/rpc.ts'

export const Route = createFileRoute('/auth/device')({
  head() {
    return { meta: [{ title: `Device Confirmation - ${__HOST__}` }] }
  },
  validateSearch: z.object({
    code_confirmed: z.boolean().optional(),
    user_code: z.string().optional(),
  }),
  async beforeLoad(context) {
    const accountId = await getAccountId()
    if (!accountId) {
      const url = rpc.api.auth.github.$url({
        query: {
          next: context.location.publicHref ?? context.location.pathname,
        },
      })
      throw redirect({ href: `${url.pathname}${url.search}` })
    }
  },
  component: Component,
})

function Component() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const confirm = useMutation({
    async mutationFn(user_code: string) {
      const res = await rpc.api.auth.device.confirm.$post({
        json: { user_code },
      })
      if (res.status === 400 || res.status === 401 || res.status === 404) {
        const json = await res.json()
        throw new Error(json.message)
      }
    },
    onSuccess() {
      navigate({ search: { ...search, code_confirmed: true } })
    },
  })

  const user_code = search.user_code
  if (!user_code)
    return (
      <div className="relative flex min-h-dvh flex-col">
        <Nav.Root fixed />
        <main className="flex flex-1 flex-col items-center px-6 pt-48 pb-32">
          <div className="flex w-fit max-w-full flex-col items-center md:items-start">
            <h1 className="text-lg font-bold">No device code provided</h1>
            <p className="text-gray8 mt-2 max-w-md text-center text-sm leading-relaxed md:text-start">
              Please use the link from your terminal to confirm a device.
            </p>
          </div>
        </main>
      </div>
    )

  const state = (() => {
    if (search.code_confirmed || confirm.isSuccess) return 'success'
    if (confirm.isPending) return 'confirming'
    if (confirm.isError) return 'error'
    return 'idle'
  })()

  return (
    <div className="relative flex min-h-dvh flex-col">
      <Nav.Root fixed />
      <main className="flex flex-1 flex-col items-center px-6 pt-48 pb-32">
        <div className="flex w-fit max-w-full flex-col items-center md:items-start">
          <h1 className="text-lg font-bold">
            {state === 'success' ? 'You\u2019re all set' : 'Device confirmation'}
          </h1>
          <p className="text-gray8 mt-2 max-w-md text-center text-sm leading-relaxed md:text-start">
            {state === 'success'
              ? 'Your device is now connected. You can close this window and return to your terminal.'
              : 'Confirm this is the code displayed in your terminal.'}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-2 md:justify-start">
            {user_code.split('').map((char, index) => (
              <div
                className="bg-gray-a1 flex items-center justify-center px-4 py-3 text-xl font-bold md:px-5 md:py-4 md:text-2xl"
                key={`${index}-${char}`}
              >
                {char}
              </div>
            ))}
          </div>

          {state === 'error' && (
            <p className="text-red9 mt-4 text-sm">
              {confirm.error?.message || 'Something went wrong. Please try again.'}
            </p>
          )}

          {state === 'success' && <div className="mt-8 h-11" />}

          {state !== 'success' && (
            <div className="mt-8 flex gap-3 self-center">
              <button
                className="bg-gray10 text-bg1 flex h-11 items-center px-4 transition-opacity hover:opacity-90 disabled:opacity-50"
                data-confirming={state === 'confirming' ? '' : undefined}
                disabled={state === 'confirming'}
                onClick={() => confirm.mutate(user_code)}
                type="button"
              >
                {state === 'confirming' ? 'Confirming' : 'Confirm code'}
              </button>
              <a
                className="border-gray-a3 text-gray9 hover:bg-gray-a1 hover:text-gray10 focus:bg-gray-a1 focus:text-gray10 flex h-11 items-center border px-4"
                href="/"
              >
                Cancel
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

const getAccountId = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const db = createClient(env.DB.connectionString)
  const sessionId = await Cookie.parseSigned(
    request.headers.get('cookie') ?? '',
    env.COOKIE_SECRET,
    'curl.session',
  )
  if (!sessionId) return null
  const session = await db
    .selectFrom('session')
    .where('id', '=', sessionId)
    .where('expires_at', '>', new Date())
    .select('account_id')
    .executeTakeFirst()
  return session?.account_id ?? null
})
