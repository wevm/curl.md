import { Field } from '@base-ui/react/field'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import * as React from 'react'
import { z } from 'zod/v4'
import { Dashboard } from '#components/Dashboard.tsx'
import { Dialog } from '#components/Dialog.tsx'
import { createClient } from '#db/client.ts'
import * as Constants from '#lib/constants.ts'
import * as Cookie from '#lib/cookie.ts'

export const Route = createFileRoute('/_dash/$login/settings')({
  head: () => ({ meta: [{ title: `Settings - ${__HOST__}` }] }),
  component: Component,
})

function Component() {
  const { account, entity } = Route.useRouteContext()
  const router = useRouter()

  return (
    <Dashboard.Content>
      <Dashboard.Heading level={1}>Settings</Dashboard.Heading>
      <SettingsForm
        entity={entity}
        key={entity.id}
        onSaved={(login) => router.navigate({ params: { login }, to: '/$login/settings' })}
      />
      {entity.type === 'organization' ? (
        <DeleteOrganization
          entity={entity}
          onDeleted={() => router.navigate({ params: { login: account.login }, to: '/$login' })}
        />
      ) : (
        <DeleteAccount account={account} onDeleted={() => router.navigate({ to: '/' })} />
      )}
    </Dashboard.Content>
  )
}

function SettingsForm(props: {
  className?: string
  entity: {
    avatar_url?: string | null
    id: string
    login: string
    name: string | null
    type: 'account' | 'organization'
  }
  onSaved: (login: string) => void
}) {
  const { entity, onSaved } = props
  const [pendingData, setPendingData] = React.useState<{ login?: string; name?: string } | null>(
    null,
  )
  const [confirmLogin, setConfirmLogin] = React.useState('')
  const [isDirty, setIsDirty] = React.useState(false)

  const update = useMutation({
    async mutationFn(data: { login?: string; name?: string }) {
      await updateEntity({ data: { entityId: entity.id, entityType: entity.type, ...data } })
      return data
    },
    onSuccess(data) {
      setPendingData(null)
      setConfirmLogin('')
      onSaved(data.login ?? entity.login)
    },
  })

  return (
    <>
      <form
        className={`flex flex-col gap-3 ${props.className ?? ''}`}
        noValidate
        onInput={(e) => {
          const form = e.currentTarget
          const name =
            (form.elements.namedItem('name') as HTMLInputElement | null)?.value.trim() ?? ''
          const login =
            (form.elements.namedItem('login') as HTMLInputElement | null)?.value
              .trim()
              .toLowerCase() ?? ''
          setIsDirty(name !== (entity.name ?? '') || login !== entity.login)
        }}
        onSubmit={(e) => {
          e.preventDefault()
          const formData = new FormData(e.currentTarget)
          const name = (formData.get('name') as string).trim()
          const login = (formData.get('login') as string).trim().toLowerCase()
          const data: { login?: string; name?: string } = {}
          if (name !== (entity.name ?? '')) data.name = name
          if (login !== entity.login) data.login = login
          if (!data.name && !data.login) return
          if (data.login) {
            setPendingData(data)
            return
          }
          update.mutate(data)
        }}
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-gray8 text-xs">Avatar</span>
          <div className="flex items-center gap-3">
            {entity.avatar_url ? (
              <img alt={entity.name ?? entity.login} className="size-16" src={entity.avatar_url} />
            ) : (
              <span className="bg-gray-a3 flex size-16 items-center justify-center text-xl uppercase">
                {(entity.name ?? entity.login)[0]}
              </span>
            )}
            <button
              className="bg-gray-a2 text-gray8 cursor-not-allowed px-3 py-1.5 text-sm opacity-50"
              disabled
              type="button"
            >
              Change avatar
            </button>
          </div>
        </div>
        <Field.Root className="flex flex-col gap-1.5" name="name">
          <Field.Label className="text-gray8 text-xs">Name</Field.Label>
          <Field.Control
            autoComplete="off"
            className="bg-gray-a1/50 border-gray-a3 data-[invalid]:border-red9 w-full border px-3 py-2 text-sm"
            data-1p-ignore
            defaultValue={entity.name ?? ''}
            placeholder="Display name"
            required
          />
          <Field.Error className="text-red9 text-xs" match="valueMissing">
            Name is required
          </Field.Error>
        </Field.Root>
        <Field.Root className="flex flex-col gap-1.5" name="login">
          <Field.Label className="text-gray8 text-xs">Login</Field.Label>
          <Field.Control
            autoComplete="off"
            className="bg-gray-a1/50 border-gray-a3 data-[invalid]:border-red9 w-full border px-3 py-2 text-sm"
            data-1p-ignore
            defaultValue={entity.login}
            pattern="^[a-z0-9][a-z0-9\-]*[a-z0-9]$"
            placeholder="lowercase-login"
            required
          />
          <Field.Error className="text-red9 text-xs" match="valueMissing">
            Login is required
          </Field.Error>
          <Field.Error className="text-red9 text-xs" match="patternMismatch">
            Must start and end with a lowercase letter or number
          </Field.Error>
        </Field.Root>
        <button
          className="bg-gray10 text-bg1 self-start px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={!isDirty || update.isPending}
          type="submit"
        >
          {update.isPending ? 'Updating' : 'Update'}
        </button>
        {update.isError && <p className="text-red9 text-sm">{update.error.message}</p>}
        {update.isSuccess && <p className="text-green9 text-sm">Settings saved.</p>}
      </form>

      <Dialog.Root
        open={pendingData !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingData(null)
            setConfirmLogin('')
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.CloseX />
            <Dialog.Title>Change login</Dialog.Title>
            <div className="bg-amber3/20 border-amber5/30 text-amber9 border px-3 py-2 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                <IconOcticonAlert16 />
                Warning
              </p>
              <p className="mt-1">
                Changing your login will break any existing links or references to your current
                login. This action cannot be undone automatically.
              </p>
            </div>
            <Dialog.Description>
              To confirm, type your current login{' '}
              <span className="text-gray12 font-medium">{entity.login}</span>.
            </Dialog.Description>
            <input
              autoComplete="off"
              className="bg-gray-a1/50 border-gray-a3 w-full border px-3 py-2 text-sm"
              data-1p-ignore
              onChange={(e) => setConfirmLogin(e.target.value)}
              placeholder={entity.login}
              value={confirmLogin}
            />
            <div className="flex justify-end gap-2">
              <Dialog.Close className="text-gray9 hover:bg-gray-a2 px-3 py-1.5 text-sm">
                Cancel
              </Dialog.Close>
              <button
                className="bg-red9 text-bg1 px-3 py-1.5 text-sm disabled:opacity-50"
                disabled={confirmLogin !== entity.login || update.isPending}
                onClick={() => {
                  if (pendingData) update.mutate(pendingData)
                }}
                type="button"
              >
                {update.isPending ? 'Changing' : 'Change login'}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

function DeleteOrganization(props: {
  entity: { id: string; login: string; name: string | null }
  onDeleted: () => void
}) {
  const [confirmLogin, setConfirmLogin] = React.useState('')
  const [open, setOpen] = React.useState(false)

  const remove = useMutation({
    async mutationFn() {
      await deleteOrganization({ data: { organizationId: props.entity.id } })
    },
    onSuccess() {
      setOpen(false)
      props.onDeleted()
    },
  })

  return (
    <Dashboard.Section title="Danger">
      <div className="border-red9/30 border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Delete organization</p>
            <p className="text-gray8 mt-0.5 text-sm">
              Permanently delete this organization and all its data.
            </p>
          </div>
          <button
            className="bg-red9 text-bg1 shrink-0 px-3 py-1.5 text-sm transition-opacity hover:opacity-90"
            onClick={() => setOpen(true)}
            type="button"
          >
            Delete
          </button>
        </div>
      </div>

      <Dialog.Root
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            setOpen(false)
            setConfirmLogin('')
            remove.reset()
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.CloseX />
            <Dialog.Title>Delete organization</Dialog.Title>
            <div className="bg-red3/20 border-red5/30 text-red9 border px-3 py-2 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                <IconOcticonStop16 />
                Danger
              </p>
              <p className="mt-1">
                This is permanent and cannot be undone. All organization data will be deleted.
              </p>
            </div>
            <Dialog.Description>
              To confirm, type the organization login{' '}
              <span className="text-gray12 font-medium">{props.entity.login}</span>.
            </Dialog.Description>
            <input
              autoComplete="off"
              className="bg-gray-a1/50 border-gray-a3 w-full border px-3 py-2 text-sm"
              data-1p-ignore
              onChange={(e) => setConfirmLogin(e.target.value)}
              placeholder={props.entity.login}
              value={confirmLogin}
            />
            {remove.isError && <p className="text-red9 text-sm">{remove.error.message}</p>}
            <div className="flex justify-end gap-2">
              <Dialog.Close className="text-gray9 hover:bg-gray-a2 px-3 py-1.5 text-sm">
                Cancel
              </Dialog.Close>
              <button
                className="bg-red9 text-bg1 px-3 py-1.5 text-sm disabled:opacity-50"
                disabled={confirmLogin !== props.entity.login || remove.isPending}
                onClick={() => remove.mutate()}
                type="button"
              >
                {remove.isPending ? 'Deleting' : 'Delete organization'}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </Dashboard.Section>
  )
}

function DeleteAccount(props: { account: { id: string; login: string }; onDeleted: () => void }) {
  const [confirmLogin, setConfirmLogin] = React.useState('')
  const [open, setOpen] = React.useState(false)

  const remove = useMutation({
    async mutationFn() {
      await deleteAccount({ data: { accountId: props.account.id } })
    },
    onSuccess() {
      setOpen(false)
      props.onDeleted()
    },
  })

  return (
    <Dashboard.Section title="Danger">
      <div className="border-red9/30 border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Delete account</p>
            <p className="text-gray8 mt-0.5 text-sm">
              Permanently delete your account and all its data.
            </p>
          </div>
          <button
            className="bg-red9 text-bg1 shrink-0 px-3 py-1.5 text-sm transition-opacity hover:opacity-90"
            onClick={() => setOpen(true)}
            type="button"
          >
            Delete
          </button>
        </div>
      </div>

      <Dialog.Root
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            setOpen(false)
            setConfirmLogin('')
            remove.reset()
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.CloseX />
            <Dialog.Title>Delete account</Dialog.Title>
            <div className="bg-red3/20 border-red5/30 text-red9 border px-3 py-2 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                <IconOcticonStop16 />
                Danger
              </p>
              <p className="mt-1">
                This is permanent and cannot be undone. All account data will be deleted.
              </p>
            </div>
            <Dialog.Description>
              To confirm, type your login{' '}
              <span className="text-gray12 font-medium">{props.account.login}</span>.
            </Dialog.Description>
            <input
              autoComplete="off"
              className="bg-gray-a1/50 border-gray-a3 w-full border px-3 py-2 text-sm"
              data-1p-ignore
              onChange={(e) => setConfirmLogin(e.target.value)}
              placeholder={props.account.login}
              value={confirmLogin}
            />
            {remove.isError && <p className="text-red9 text-sm">{remove.error.message}</p>}
            <div className="flex justify-end gap-2">
              <Dialog.Close className="text-gray9 hover:bg-gray-a2 px-3 py-1.5 text-sm">
                Cancel
              </Dialog.Close>
              <button
                className="bg-red9 text-bg1 px-3 py-1.5 text-sm disabled:opacity-50"
                disabled={confirmLogin !== props.account.login || remove.isPending}
                onClick={() => remove.mutate()}
                type="button"
              >
                {remove.isPending ? 'Deleting' : 'Delete account'}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </Dashboard.Section>
  )
}

// --- Server Functions ---

const updateEntityInput = z.object({
  entityId: z.string(),
  entityType: z.enum(['account', 'organization']),
  login: z
    .string()
    .min(2)
    .max(50)
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      'Must start and end with a lowercase letter or number, and contain only lowercase letters, numbers, or hyphens',
    )
    .optional(),
  name: z.string().min(1).max(100).optional(),
})

const updateEntity = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.parse(updateEntityInput, data))
  .handler(async (c) => {
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
    if (!accountId) throw new Error('Authentication required')

    const { entityId, entityType, login, name } = c.data
    if (!login && !name) throw new Error('No changes provided')

    if (entityType === 'organization') {
      const member = await db
        .selectFrom('organization_member')
        .where('organization_id', '=', entityId)
        .where('account_id', '=', accountId)
        .where('role', 'in', ['owner', 'admin'])
        .select('id')
        .executeTakeFirst()
      if (!member) throw new Error('Insufficient permissions')
    }

    if (login) {
      if (Constants.reservedLogins.has(login)) throw new Error('Login is reserved')

      const existingLogin = await db
        .selectFrom((eb) =>
          eb
            .selectFrom('account')
            .select('id')
            .where('login', '=', login)
            .where('id', '!=', entityType === 'account' ? accountId : '')
            .unionAll(
              eb
                .selectFrom('organization')
                .select('id')
                .where('login', '=', login)
                .where('id', '!=', entityType === 'organization' ? entityId : ''),
            )
            .as('existing'),
        )
        .select('id')
        .limit(1)
        .executeTakeFirst()
      if (existingLogin) throw new Error('Login is already taken')
    }

    const set: Record<string, string> = {}
    if (login) set.login = login
    if (name) set.name = name

    if (entityType === 'organization') {
      await db
        .updateTable('organization')
        .set(set)
        .where('id', '=', entityId)
        .where('deleted_at', 'is', null)
        .execute()
    } else {
      await db.updateTable('account').set(set).where('id', '=', accountId).execute()
    }
  })

const deleteOrganization = createServerFn({ method: 'POST' })
  .inputValidator((data: { organizationId: string }) => data)
  .handler(async (c) => {
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
    if (!accountId) throw new Error('Authentication required')

    const member = await db
      .selectFrom('organization_member')
      .where('organization_id', '=', c.data.organizationId)
      .where('account_id', '=', accountId)
      .where('role', '=', 'owner')
      .select('id')
      .executeTakeFirst()
    if (!member) throw new Error('Insufficient permissions')

    const org = await db
      .selectFrom('organization')
      .where('id', '=', c.data.organizationId)
      .where('deleted_at', 'is', null)
      .select('balance_mills')
      .executeTakeFirst()
    if (!org) throw new Error('Organization not found')
    if (org.balance_mills !== 0) throw new Error('Organization has a non-zero balance')

    await db
      .updateTable('organization')
      .set({ deleted_at: new Date() })
      .where('id', '=', c.data.organizationId)
      .where('deleted_at', 'is', null)
      .execute()
  })

const deleteAccount = createServerFn({ method: 'POST' })
  .inputValidator((data: { accountId: string }) => data)
  .handler(async (c) => {
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
    if (!accountId) throw new Error('Authentication required')
    if (accountId !== c.data.accountId) throw new Error('Insufficient permissions')

    const account = await db
      .selectFrom('account')
      .where('id', '=', accountId)
      .where('deleted_at', 'is', null)
      .select('balance_mills')
      .executeTakeFirst()
    if (!account) throw new Error('Account not found')
    if (account.balance_mills !== 0) throw new Error('Account has a non-zero balance')

    const ownedOrg = await db
      .selectFrom('organization_member')
      .innerJoin('organization', 'organization.id', 'organization_member.organization_id')
      .where('organization_member.account_id', '=', accountId)
      .where('organization_member.role', '=', 'owner')
      .where('organization.deleted_at', 'is', null)
      .select('organization.id')
      .executeTakeFirst()
    if (ownedOrg) throw new Error('You must transfer or delete owned organizations first')

    await db
      .updateTable('account')
      .set({ deleted_at: new Date() })
      .where('id', '=', accountId)
      .where('deleted_at', 'is', null)
      .execute()
  })
