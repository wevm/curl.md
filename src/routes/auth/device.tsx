import { env } from 'cloudflare:workers'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { useState } from 'react'
import { z } from 'zod'
import { getDb } from '#lib/db.ts'
import { rpc } from '#lib/rpc.ts'
import * as Session from '#lib/session.ts'

export const Route = createFileRoute('/auth/device')({
  head: () => ({
    meta: [{ title: `Device Confirmation - ${__HOST__}` }],
  }),
  validateSearch: z.object({ user_code: z.string().optional() }),
  beforeLoad: async (context) => {
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
  component: DeviceConfirmation,
})

function DeviceConfirmation() {
  const { user_code } = Route.useSearch()
  const [state, setState] = useState<
    'idle' | 'confirming' | 'success' | 'error'
  >('idle')
  const [errorMessage, setErrorMessage] = useState('')

  if (!user_code)
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
        <h1 className="font-bold text-lg">No device code provided</h1>
        <p className="mt-2 text-gray11">
          Please use the link from your terminal to confirm a device.
        </p>
      </div>
    )

  if (state === 'success')
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
        <IconLucideCircleCheck className="size-8 text-green9" />
        <h1 className="mt-4 font-bold text-lg">You're all set.</h1>
        <p className="mt-2 text-center text-gray11">
          Your device is now connected. You can close this browser window and
          return to your terminal.
        </p>
      </div>
    )

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <div className="flex items-center gap-2 text-gray11">
        <IconLucideFingerprint className="size-4" />
        <span>Device confirmation</span>
      </div>
      <h1 className="mt-3 text-center font-bold text-lg">
        Please confirm this is the code displayed in your terminal
      </h1>

      <div className="mt-8 flex gap-2">
        {user_code.split('').map((char, i) => (
          <div
            className="flex items-center justify-center bg-gray3 px-5 py-4 font-bold text-2xl"
            key={`${i}-${char}`}
          >
            {char}
          </div>
        ))}
      </div>

      {state === 'error' && (
        <p className="mt-4 text-red9">
          {errorMessage || 'Something went wrong. Please try again.'}
        </p>
      )}

      <div className="mt-8 flex gap-3">
        <button
          className="bg-gray12 px-4 py-2 text-gray1 hover:bg-gray11 disabled:opacity-50"
          data-confirming={state === 'confirming' ? '' : undefined}
          disabled={state === 'confirming'}
          onClick={async () => {
            setState('confirming')
            try {
              const res = await rpc.api.auth.device.confirm.$post({
                json: { user_code },
              })
              if (res.status !== 200) {
                const json = await res.json()
                setErrorMessage(
                  'error' in json ? json.error : 'Failed to confirm device.',
                )
                setState('error')
                return
              }
              setState('success')
            } catch {
              setErrorMessage('Failed to confirm device.')
              setState('error')
            }
          }}
          type="button"
        >
          {state === 'confirming' ? 'Confirming...' : 'Confirm code'}
        </button>
        <a className="px-4 py-2 text-gray11 hover:text-gray12" href="/">
          Cancel
        </a>
      </div>
    </div>
  )
}

const getAccountId = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const db = getDb(env.DB.connectionString)
  return Session.getAccountId(request, db, env.COOKIE_SECRET)
})
