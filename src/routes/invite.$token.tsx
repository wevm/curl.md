import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { z } from 'zod/mini'
import { Nav } from '#components/Nav.tsx'
import { createClient } from '#db/client.ts'
import * as Cookie from '#lib/cookie.ts'
import { rpc } from '#lib/rpc.ts'

export const Route = createFileRoute('/invite/$token')({
  head() {
    return { meta: [{ title: `Accept Invite - ${__HOST__}` }] }
  },
  loader: ({ params }) => getInviteData({ data: { token: params.token } }),
  component: Component,
})

function Component() {
  const loaderData = Route.useLoaderData()
  const params = Route.useParams()
  const router = useRouter()

  const accept = useMutation({
    async mutationFn() {
      const res = await rpc.api.invites[':token'].accept.$post({
        param: { token: params.token },
      })
      if (res.status === 401 || res.status === 404 || res.status === 409) {
        const json = await res.json()
        throw new Error(json.message)
      }
      const json = await res.json()
      return json.organization
    },
    onSuccess(organization) {
      return router.navigate({
        to: '/$login',
        params: { login: organization.login },
      })
    },
  })

  if (!loaderData.invite)
    return (
      <div className="relative flex min-h-dvh flex-col">
        <Nav.Root fixed />
        <main className="flex flex-1 flex-col items-center px-6 pt-48 pb-32">
          <div className="flex w-full flex-col sm:max-w-sm">
            <h1 className="text-lg font-bold">Invalid Invite</h1>
            <p className="text-gray8 mt-2 text-sm leading-relaxed">
              This invite link is invalid or has expired.
            </p>
            <a
              className="bg-gray10 text-bg1 mt-6 flex h-11 w-full items-center justify-center px-4 transition-opacity hover:opacity-90"
              href="/"
            >
              Go home
            </a>
          </div>
        </main>
      </div>
    )

  const label = loaderData.invite.organization.name ?? loaderData.invite.organization.login
  if (!loaderData.login)
    return (
      <div className="relative flex min-h-dvh flex-col">
        <Nav.Root fixed />
        <main className="flex flex-1 flex-col items-center px-6 pt-48 pb-32">
          <div className="flex w-full flex-col sm:max-w-sm">
            <h1 className="text-lg font-bold">Join {label}</h1>
            <p className="text-gray8 mt-2 text-sm leading-relaxed">
              Sign in to accept this invite.
            </p>
            <a
              className="bg-gray10 text-bg1 mt-6 flex h-11 w-full items-center justify-center gap-2 px-4 transition-opacity hover:opacity-90"
              href={(() => {
                const url = rpc.api.auth.github.$url({ query: { next: `/invite/${params.token}` } })
                return `${url.pathname}${url.search}`
              })()}
            >
              <IconOcticonMarkGithub16 className="size-5" />
              Continue with GitHub
            </a>
          </div>
        </main>
      </div>
    )

  return (
    <div className="relative flex min-h-dvh flex-col">
      <Nav.Root fixed />
      <main className="flex flex-1 flex-col items-center px-6 pt-48 pb-32">
        <div className="flex w-full flex-col sm:max-w-sm">
          <h1 className="text-lg font-bold">Join {label}</h1>
          <p className="text-gray8 mt-2 text-sm leading-relaxed">
            You&rsquo;ve been invited to join <strong>{label}</strong> as a {loaderData.invite.role}
            .
          </p>

          {accept.error?.message && <p className="text-red9 mt-4">{accept.error.message}</p>}

          <button
            className="bg-gray10 text-bg1 mt-6 flex h-11 w-full items-center justify-center px-4 transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={accept.isPending}
            onClick={() => accept.mutate()}
            type="button"
          >
            {accept.isPending ? 'Joining' : 'Join'}
          </button>
        </div>
      </main>
    </div>
  )
}

const getInviteData = createServerFn({ method: 'GET' })
  .inputValidator((data) => z.parse(z.object({ token: z.string() }), data))
  .handler(async (c) => {
    const request = getRequest()
    const db = createClient(env.DB.connectionString)

    const invite = await db
      .selectFrom('organization_invite')
      .innerJoin('organization', 'organization.id', 'organization_invite.organization_id')
      .where('organization_invite.token', '=', c.data.token)
      .where('organization_invite.deleted_at', 'is', null)
      .where('organization_invite.expires_at', '>', new Date())
      .where((eb) =>
        eb.or([
          eb('organization_invite.max_uses', 'is', null),
          eb('organization_invite.use_count', '<', eb.ref('organization_invite.max_uses')),
        ]),
      )
      .select(['organization.login', 'organization.name', 'organization_invite.role'])
      .executeTakeFirst()

    if (!invite)
      return { invite: null, login: null } as {
        invite: null
        login: null
      }

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

    let login: string | null = null
    if (accountId) {
      const account = await db
        .selectFrom('account')
        .where('id', '=', accountId)
        .select('login')
        .executeTakeFirst()
      login = account?.login ?? null
    }

    return {
      invite: {
        organization: { login: invite.login, name: invite.name },
        role: invite.role,
      },
      login,
    }
  })
