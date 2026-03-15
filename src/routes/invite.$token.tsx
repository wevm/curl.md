import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { createClient } from '#db/client.ts'
import * as Cookie from '#lib/cookie.ts'
import { rpc } from '#lib/rpc.ts'

export const Route = createFileRoute('/invite/$token')({
  head() {
    return { meta: [{ title: `Accept Invite - ${__HOST__}` }] }
  },
  loader: ({ params }) => getInviteData({ data: { token: params.token } }),
  component: InvitePage,
})

function InvitePage() {
  const { invite, login } = Route.useLoaderData()
  const { token } = Route.useParams()
  const router = useRouter()

  const accept = useMutation({
    async mutationFn() {
      const res = await rpc.api.invites[':token'].accept.$post({
        param: { token },
      })
      if (res.status === 409) throw new Error('already_member')
      if (res.status !== 200) throw new Error('accept_failed')
      const json = await res.json()
      return json.organization
    },
    onSuccess(organization) {
      return router.navigate({
        to: '/~dash/$login',
        params: { login: organization.login },
      })
    },
  })

  if (!invite)
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
        <IconLucideX className="text-red9 size-10" />
        <h1 className="mt-4 text-lg font-bold">Invalid Invite</h1>
        <p className="text-gray9 dark:text-gray6 mt-2 text-center">
          This invite link is invalid or has expired.
        </p>
        <a className="text-gray9 hover:text-gray10 dark:text-gray6 mt-6 hover:underline" href="/">
          Go home
        </a>
      </div>
    )

  if (!login)
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
        <h1 className="text-lg font-bold">
          Join {invite.organization.name ?? invite.organization.login}
        </h1>
        <p className="text-gray9 dark:text-gray6 mt-2 text-center">
          Sign in to accept this invite.
        </p>
        <a
          className="bg-gray12 text-gray1 hover:bg-gray11 mt-6 flex items-center gap-2 px-4 py-2"
          href={`/api/auth/github?next=${encodeURIComponent(`/invite/${token}`)}`}
        >
          <IconOcticonMarkGithub16 className="size-5" />
          Continue with GitHub
        </a>
      </div>
    )

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <h1 className="text-lg font-bold">
        Join {invite.organization.name ?? invite.organization.login}
      </h1>
      <p className="text-gray9 dark:text-gray6 mt-2 text-center">
        You've been invited to join{' '}
        <strong>{invite.organization.name ?? invite.organization.login}</strong> as a {invite.role}.
      </p>

      {accept.error?.message === 'already_member' ? (
        <p className="text-yellow9 mt-4 text-center">
          You're already a member of this organization.
        </p>
      ) : accept.error ? (
        <p className="text-red9 mt-4 text-center">Something went wrong. Please try again.</p>
      ) : null}

      <button
        className="bg-gray12 text-gray1 hover:bg-gray11 mt-6 px-4 py-2 disabled:opacity-50"
        disabled={accept.isPending}
        onClick={() => accept.mutate()}
        type="button"
      >
        {accept.isPending
          ? 'Joining...'
          : `Join ${invite.organization.name ?? invite.organization.login}`}
      </button>
    </div>
  )
}

const getInviteData = createServerFn({ method: 'GET' })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data: { token } }) => {
    const request = getRequest()
    const db = createClient(env.DB.connectionString)

    const invite = await db
      .selectFrom('organization_invite')
      .innerJoin('organization', 'organization.id', 'organization_invite.organization_id')
      .where('organization_invite.token', '=', token)
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
