import { Dialog } from '@base-ui/react/dialog'
import { Field } from '@base-ui/react/field'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import * as React from 'react'
import { rpc } from '#lib/rpc.ts'

export const Route = createFileRoute('/~dash/$login/~/settings')({
  head: () => ({ meta: [{ title: `Settings - ${__HOST__}` }] }),
  component: Component,
})

function Component() {
  const { entity } = Route.useRouteContext()
  const router = useRouter()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-6 pb-16">
      <h1 className="text-lg font-bold">Settings</h1>
      <SettingsForm
        className="mt-4"
        entity={entity}
        onSaved={(login) => router.navigate({ params: { login }, to: '/~dash/$login/~/settings' })}
      />
    </div>
  )
}

// --- Components ---

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

  const update = useMutation({
    async mutationFn(data: { login?: string; name?: string }) {
      const res =
        entity.type === 'organization'
          ? await rpc.api.orgs[':id'].$patch({ param: { id: entity.id }, json: data })
          : await rpc.api.account.$patch({ json: data })
      if (res.status !== 200) {
        const body = (await res.json()) as {
          issues?: { message: string; path: string }[]
          message?: string
        }
        const message =
          body.issues?.map((i) => i.message).join(', ') || body.message || 'Failed to save'
        throw new Error(message)
      }
      return data
    },
    onSuccess(data) {
      onSaved(data.login ?? entity.login)
    },
  })

  return (
    <form
      className={`flex flex-col gap-3 ${props.className ?? ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        const name = (formData.get('name') as string).trim()
        const login = (formData.get('login') as string).trim().toLowerCase()
        const data: { login?: string; name?: string } = {}
        if (name !== (entity.name ?? '')) data.name = name
        if (login !== entity.login) data.login = login
        if (!data.name && !data.login) return
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
          className="bg-gray-a1/50 border-gray-a3 w-full border px-3 py-2 text-sm"
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
          className="bg-gray-a1/50 border-gray-a3 w-full border px-3 py-2 text-sm"
          data-1p-ignore
          defaultValue={entity.login}
          pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$"
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
        disabled={update.isPending}
        type="submit"
      >
        {update.isPending ? 'Updating' : 'Update'}
      </button>
      {update.isError && <p className="text-red9 text-sm">{update.error.message}</p>}
      {update.isSuccess && <p className="text-green9 text-sm">Settings saved.</p>}
    </form>
  )
}
