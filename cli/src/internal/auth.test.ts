import { HttpResponse, http } from 'msw'
import { beforeEach, expect, inject, test } from 'vitest'
import { Env } from '#test/env.ts'
import { server } from '../../test/server.ts'
import { useTmp } from '../../test/utils.ts'
import { Auth } from './auth.ts'
import { Session } from './session.ts'

const env = Env.parse(inject('env'))

beforeEach(() => {
  server.resetHandlers()
  const tmp = useTmp()
  return () => tmp.cleanup()
})

test('Auth.createResolver reads organization fresh and clears cached auth when session disappears', async () => {
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString() // 5 minutes
  let headersCalls = 0
  server.use(
    http.post(`${env.CURLMD_BASE_URL}/api/auth/headers`, async () => {
      headersCalls++
      return HttpResponse.json({
        authorization: 'Bearer curlmd_at_cached',
        expires_at: expiresAt,
      })
    }),
  )

  Session.write({
    organization_id: 'org_1',
    refresh_token: 'curlmd_rt_cached',
    refresh_token_expires_at: new Date(Date.now() + 120_000).toISOString(), // 2 minutes
  })
  const resolveAuthHeaders = Auth.createResolver(env.CURLMD_BASE_URL)

  expect(await resolveAuthHeaders()).toEqual({
    authorization: 'Bearer curlmd_at_cached',
    expires_at: expiresAt,
    organization_id: 'org_1',
  })

  Session.write({ organization_id: 'org_2' })
  expect(await resolveAuthHeaders()).toEqual({
    authorization: 'Bearer curlmd_at_cached',
    expires_at: expiresAt,
    organization_id: 'org_2',
  })
  expect(headersCalls).toBe(1)

  Session.delete()
  expect(await resolveAuthHeaders()).toBeNull()
  expect(headersCalls).toBe(1)
})

test('Auth.waitForLogin clears stale organization and succeeds when auth.me fails', async () => {
  const refreshTokenExpiresAt = new Date(Date.now() + 120_000).toISOString() // 2 minutes
  server.use(
    http.post(`${env.CURLMD_BASE_URL}/api/auth/device/token`, async () => {
      return HttpResponse.json({
        authorization: 'Bearer curlmd_at_new',
        expires_at: null,
        refresh_token: 'curlmd_rt_new',
        refresh_token_expires_at: refreshTokenExpiresAt,
      })
    }),
    http.get(`${env.CURLMD_BASE_URL}/api/auth/me`, async () => {
      return new HttpResponse(null, { status: 500 })
    }),
  )

  Session.write({
    organization_id: 'stale_org',
    refresh_token: 'curlmd_rt_old',
    refresh_token_expires_at: new Date(Date.now() + 180_000).toISOString(), // 3 minutes
  })

  const result = await Auth.waitForLogin(env.CURLMD_BASE_URL, {
    code: 'device_code',
    interval: 0,
  })
  expect(result).toEqual({
    ok: true,
    data: {
      expires_at: null,
      login: null,
    },
  })
  expect(Session.read()).toMatchObject({
    refresh_token: 'curlmd_rt_new',
    refresh_token_expires_at: refreshTokenExpiresAt,
  })
  expect(Session.read()?.organization_id).toBeUndefined()
})

test('Auth.logout revokes best effort and still clears local session', async () => {
  let revoked = false
  server.use(
    http.post(`${env.CURLMD_BASE_URL}/api/auth/logout`, async () => {
      revoked = true
      return new HttpResponse(null, { status: 500 })
    }),
  )

  Session.write({
    organization_id: 'org_1',
    refresh_token: 'curlmd_rt_active',
    refresh_token_expires_at: new Date(Date.now() + 120_000).toISOString(), // 2 minutes
  })

  const result = await Auth.logout(env.CURLMD_BASE_URL)
  expect(result).toEqual({
    ok: true,
    data: { login: null },
  })
  expect(revoked).toBe(true)
  expect(Session.read()).toBeNull()
})

test('Auth.createResolver keeps local session on transient auth header failures', async () => {
  server.use(
    http.post(`${env.CURLMD_BASE_URL}/api/auth/headers`, async () => {
      return new HttpResponse(null, { status: 500 })
    }),
  )

  Session.write(
    {
      refresh_token: 'curlmd_rt_cached',
      refresh_token_expires_at: new Date(Date.now() + 120_000).toISOString(), // 2 minutes
    },
    env.CURLMD_BASE_URL,
  )

  const resolveAuthHeaders = Auth.createResolver(env.CURLMD_BASE_URL)

  expect(await resolveAuthHeaders()).toBeNull()
  expect(Session.read(env.CURLMD_BASE_URL)).toMatchObject({
    refresh_token: 'curlmd_rt_cached',
  })
})
