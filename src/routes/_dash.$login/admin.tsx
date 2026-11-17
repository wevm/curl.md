import { useMutation } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import * as React from 'react'
import { z } from 'zod/v4'
import { Dashboard } from '#components/Dashboard.tsx'
import { createClient } from '#db/client.ts'
import { formatMills } from '#lib/format.ts'
import { requireSameOrigin, requireSession } from '#server/access.ts'

export const Route = createFileRoute('/_dash/$login/admin')({
  beforeLoad({ context }) {
    if (context.account.role !== 'crew') throw notFound()
  },
  head: () => ({ meta: [{ title: `Admin - ${__HOST__}` }] }),
  component: Component,
})

function Component() {
  const [triggered, setTriggered] = React.useState(false)

  return (
    <Dashboard.Content>
      <Dashboard.Heading level={1}>Admin</Dashboard.Heading>
      <div className="bg-gray-a1/50 border-gray-a3 flex flex-col gap-3 border p-4">
        <div>
          <h2 className="text-sm font-bold">Sentry Test error reporting</h2>
          <p className="text-gray8 mt-1 text-sm">
            Trigger a client-side error to verify Sentry is receiving dashboard events.
          </p>
        </div>
        <button
          className="bg-red9 text-bg1 h-8 self-start px-3 text-sm transition-opacity hover:opacity-90"
          onClick={() => {
            setTriggered(true)
            console.info('Sentry test error triggered. Check the browser console and Sentry.')
            setTimeout(() => {
              throw new Error('Sentry Test Error')
            })
          }}
          type="button"
        >
          Break the world
        </button>
      </div>
      {triggered && (
        <p className="text-gray8 mt-3 text-sm">
          Test error triggered. Check the browser console and Sentry issue stream.
        </p>
      )}
      <PromoCreditForm />
    </Dashboard.Content>
  )
}

function PromoCreditForm() {
  const grant = useMutation({
    mutationFn(data: { amount: string; login: string }) {
      return grantPromoCredit({ data })
    },
  })

  return (
    <form
      className="bg-gray-a1/50 border-gray-a3 mt-6 flex flex-col gap-4 border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const formData = new FormData(form)
        grant.mutate(
          {
            amount: (formData.get('amount') as string).trim(),
            login: (formData.get('login') as string).trim().toLowerCase(),
          },
          {
            onSuccess() {
              form.reset()
            },
          },
        )
      }}
    >
      <div>
        <h2 className="text-sm font-bold">Grant promo credits</h2>
        <p className="text-gray8 mt-1 text-sm">
          Add a promo credit transaction to an account or organization by login.
        </p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-gray8 text-xs">Account or organization login</span>
        <input
          autoComplete="off"
          className="bg-bg1 border-gray-a3 h-9 w-full border px-3 text-sm"
          name="login"
          placeholder="login"
          required
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-gray8 text-xs">Amount (USD)</span>
        <input
          className="bg-bg1 border-gray-a3 h-9 w-full border px-3 text-sm"
          inputMode="decimal"
          max="100"
          min="0.001"
          name="amount"
          placeholder="25.00"
          required
          step="0.001"
          type="number"
        />
      </label>
      <button
        className="bg-gray10 text-bg1 h-8 self-start px-3 text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        disabled={grant.isPending}
        type="submit"
      >
        {grant.isPending ? 'Granting' : 'Grant credits'}
      </button>
      {grant.isError && <p className="text-red9 text-sm">{grant.error.message}</p>}
      {grant.isSuccess && (
        <p className="text-green9 text-sm">
          Granted ${formatMills(grant.data.amount_mills)} to {grant.data.login}. New balance: $
          {formatMills(grant.data.balance_after_mills)}.
        </p>
      )}
    </form>
  )
}

const grantPromoCredit = createServerFn({ method: 'POST' })
  .validator((data) =>
    z.parse(
      z.object({
        amount: z
          .string()
          .trim()
          .min(1)
          .max(20)
          .regex(/^\d+(?:\.\d{1,3})?$/),
        login: z.string().trim().toLowerCase().min(1).max(50),
      }),
      data,
    ),
  )
  .handler(async (c) => {
    const request = getRequest()
    requireSameOrigin(request)
    const db = createClient(env.DB.connectionString)
    const accountId = await requireSession(request, db)
    const admin = await db
      .selectFrom('account')
      .where('id', '=', accountId)
      .where('deleted_at', 'is', null)
      .select('role')
      .executeTakeFirst()
    if (admin?.role !== 'crew') throw new Error('Insufficient permissions')

    const [dollars, mills = ''] = c.data.amount.split('.')
    const amountMills = Number(dollars) * 1000 + Number(mills.padEnd(3, '0'))
    const maxAmountMills = 100 * 1000 // $100
    if (amountMills <= 0) throw new Error('Amount must be greater than zero')
    if (amountMills > maxAmountMills) throw new Error('Amount must be $100 or less')
    if (!Number.isSafeInteger(amountMills)) throw new Error('Amount is too large')

    const account = await db
      .selectFrom('account')
      .where('login', '=', c.data.login)
      .where('deleted_at', 'is', null)
      .select(['id', 'login'])
      .executeTakeFirst()
    const organization = account
      ? null
      : await db
          .selectFrom('organization')
          .where('login', '=', c.data.login)
          .where('deleted_at', 'is', null)
          .select(['id', 'login'])
          .executeTakeFirst()
    const entity = account
      ? { id: account.id, login: account.login, type: 'account' as const }
      : organization
        ? { id: organization.id, login: organization.login, type: 'organization' as const }
        : null
    if (!entity) throw new Error('Account or organization not found')

    let balanceAfterMills = 0
    await db.transaction().execute(async (tx) => {
      if (entity.type === 'account') {
        const updated = await tx
          .updateTable('account')
          .set((eb) => ({ balance_mills: eb('balance_mills', '+', amountMills) }))
          .where('id', '=', entity.id)
          .where('deleted_at', 'is', null)
          .returning('balance_mills')
          .executeTakeFirst()
        if (!updated) throw new Error('Account not found')
        balanceAfterMills = updated.balance_mills
        await tx
          .insertInto('credit_transaction')
          .values({
            account_id: entity.id,
            amount_mills: amountMills,
            balance_after_mills: balanceAfterMills,
            type: 'promo',
          })
          .execute()
        return
      }

      const updated = await tx
        .updateTable('organization')
        .set((eb) => ({ balance_mills: eb('balance_mills', '+', amountMills) }))
        .where('id', '=', entity.id)
        .where('deleted_at', 'is', null)
        .returning('balance_mills')
        .executeTakeFirst()
      if (!updated) throw new Error('Organization not found')
      balanceAfterMills = updated.balance_mills
      await tx
        .insertInto('credit_transaction')
        .values({
          amount_mills: amountMills,
          balance_after_mills: balanceAfterMills,
          organization_id: entity.id,
          type: 'promo',
        })
        .execute()
    })

    await env.KV.put(`balance:${entity.id}`, String(balanceAfterMills))

    return {
      amount_mills: amountMills,
      balance_after_mills: balanceAfterMills,
      login: entity.login,
      type: entity.type,
    }
  })
