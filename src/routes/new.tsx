import { env } from 'cloudflare:workers'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import * as React from 'react'
import { getDb } from '#lib/db.ts'
import { rpc } from '#lib/rpc.ts'
import * as Session from '#lib/session.ts'

export const Route = createFileRoute('/new')({
  head: () => ({
    meta: [{ title: `New Organization - ${__HOST__}` }],
  }),
  beforeLoad: async () => {
    const result = await getAccount()
    if (!result) throw redirect({ to: '/login', search: { next: '/new' } })
    if (result.slug)
      throw redirect({
        to: '/~org/$slug',
        params: { slug: result.slug },
      })
    return { account: result }
  },
  component: NewOrganization,
})

function NewOrganization() {
  const navigate = useNavigate()
  const [name, setName] = React.useState('')
  const [error, setError] = React.useState('')
  const [pending, setPending] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setPending(true)
    setError('')
    try {
      const trimmed = name.trim()
      const slug = trimmed
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
      const res = await rpc.api.organizations.$post({
        json: { name: trimmed, slug },
      })
      const data = await res.json()
      if (!res.ok || !('slug' in data))
        throw new Error('error' in data ? data.error : 'Failed to create')
      navigate({ to: '/~org/$slug', params: { slug: data.slug } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
      setPending(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <h1 className="font-bold text-lg">Create Organization</h1>
      <form className="mt-6 flex w-full flex-col gap-4" onSubmit={handleSubmit}>
        <input
          className="w-full bg-gray-a1 px-3 py-2 text-gray10 placeholder:text-gray9 dark:placeholder:text-gray6"
          onChange={(e) => setName(e.target.value)}
          placeholder="Organization name"
          type="text"
          value={name}
        />
        {error && <p className="text-red9">{error}</p>}
        <button
          className="bg-gray12 px-4 py-2 text-gray1 not-disabled:hover:bg-gray11 disabled:opacity-50"
          disabled={pending || !name.trim()}
          type="submit"
        >
          {pending ? 'Creating...' : 'Create'}
        </button>
      </form>
    </div>
  )
}

const getAccount = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const db = getDb(env.DB.connectionString)
  const accountId = await Session.getAccountId(request, db, env.COOKIE_SECRET)
  if (!accountId) return null

  const account = await db
    .selectFrom('account')
    .where('id', '=', accountId)
    .select(['id', 'name'])
    .executeTakeFirst()
  if (!account) return null

  const membership = await db
    .selectFrom('organization_member')
    .innerJoin(
      'organization',
      'organization.id',
      'organization_member.organization_id',
    )
    .where('organization_member.account_id', '=', accountId)
    .where('organization.deleted_at', 'is', null)
    .select('organization.slug')
    .executeTakeFirst()

  return { ...account, slug: membership?.slug ?? null }
})
