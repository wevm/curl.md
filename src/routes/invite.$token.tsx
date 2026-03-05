import { env } from 'cloudflare:workers'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getDb } from '#lib/db.ts'
import { rpc } from '#lib/rpc.ts'
import * as Session from '#lib/session.ts'

export const Route = createFileRoute('/invite/$token')({
  head: () => ({
    meta: [{ title: `Accept Invite - ${__HOST__}` }],
  }),
  loader: ({ params }) => getInviteData({ data: { token: params.token } }),
  component: InvitePage,
})

function InvitePage() {
  const { invite, login } = Route.useLoaderData()
  const { token } = Route.useParams()
  const router = useRouter()

  const accept = useMutation({
    mutationFn: async () => {
      const res = await rpc.api.invites[':token'].accept.$post({
        param: { token },
      })
      if (res.status === 409) throw new Error('already_member')
      if (res.status !== 200) throw new Error('accept_failed')
      const json = await res.json()
      return json.organization
    },
    onSuccess: (organization) =>
      router.navigate({
        to: '/~dash/$login',
        params: { login: organization.login },
      }),
  })

  if (!invite)
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
        <IconLucideX className="size-10 text-red9" />
        <h1 className="mt-4 font-bold text-lg">Invalid Invite</h1>
        <p className="mt-2 text-center text-gray9 dark:text-gray6">
          This invite link is invalid or has expired.
        </p>
        <a
          className="mt-6 text-gray9 hover:text-gray10 hover:underline dark:text-gray6"
          href="/"
        >
          Go home
        </a>
      </div>
    )

  if (!login)
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
        <h1 className="font-bold text-lg">
          Join {invite.organization.name ?? invite.organization.login}
        </h1>
        <p className="mt-2 text-center text-gray9 dark:text-gray6">
          Sign in to accept this invite.
        </p>
        <a
          className="mt-6 flex items-center gap-2 bg-gray12 px-4 py-2 text-gray1 hover:bg-gray11"
          href={`/api/auth/github?next=${encodeURIComponent(`/invite/${token}`)}`}
        >
          <IconOcticonMarkGithub16 className="size-5" />
          Continue with GitHub
        </a>
      </div>
    )

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <h1 className="font-bold text-lg">
        Join {invite.organization.name ?? invite.organization.login}
      </h1>
      <p className="mt-2 text-center text-gray9 dark:text-gray6">
        You've been invited to join{' '}
        <strong>{invite.organization.name ?? invite.organization.login}</strong>{' '}
        as a {invite.role}.
      </p>

      {accept.error?.message === 'already_member' ? (
        <p className="mt-4 text-center text-yellow9">
          You're already a member of this organization.
        </p>
      ) : accept.error ? (
        <p className="mt-4 text-center text-red9">
          Something went wrong. Please try again.
        </p>
      ) : null}

      <button
        className="mt-6 bg-gray12 px-4 py-2 text-gray1 hover:bg-gray11 disabled:opacity-50"
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
    const db = getDb(env.DB.connectionString)

    const invite = await db
      .selectFrom('organization_invite')
      .innerJoin(
        'organization',
        'organization.id',
        'organization_invite.organization_id',
      )
      .where('organization_invite.token', '=', token)
      .where('organization_invite.deleted_at', 'is', null)
      .where('organization_invite.expires_at', '>', new Date())
      .where((eb) =>
        eb.or([
          eb('organization_invite.max_uses', 'is', null),
          eb(
            'organization_invite.use_count',
            '<',
            eb.ref('organization_invite.max_uses'),
          ),
        ]),
      )
      .select([
        'organization.login',
        'organization.name',
        'organization_invite.role',
      ])
      .executeTakeFirst()

    if (!invite)
      return { invite: null, login: null } as {
        invite: null
        login: null
      }

    const accountId = await Session.getAccountId(request, db, env.COOKIE_SECRET)
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
