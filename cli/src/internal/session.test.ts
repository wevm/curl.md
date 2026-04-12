import { beforeEach, expect, test } from 'vitest'
import { useTmp } from '../../test/utils.ts'
import { Session } from './session.ts'

beforeEach(() => {
  const tmp = useTmp()
  return () => tmp.cleanup()
})

test('Session stores auth state separately per base URL', () => {
  const localBaseUrl = 'https://curl.local'
  const prodBaseUrl = 'https://curl.md'

  Session.write(
    {
      organization_id: 'org_local',
      refresh_token: 'curlmd_rt_local',
      refresh_token_expires_at: new Date(Date.now() + 120_000).toISOString(), // 2 minutes
    },
    localBaseUrl,
  )
  Session.write(
    {
      organization_id: 'org_prod',
      refresh_token: 'curlmd_rt_prod',
      refresh_token_expires_at: new Date(Date.now() + 180_000).toISOString(), // 3 minutes
    },
    prodBaseUrl,
  )

  expect(Session.read(localBaseUrl)).toMatchObject({
    organization_id: 'org_local',
    refresh_token: 'curlmd_rt_local',
  })
  expect(Session.read(prodBaseUrl)).toMatchObject({
    organization_id: 'org_prod',
    refresh_token: 'curlmd_rt_prod',
  })
})
