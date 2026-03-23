import type { Context } from 'hono'
import * as cookie from 'hono/cookie'
import * as cookieUtils from 'hono/utils/cookie'
import type { CookieOptions } from 'hono/utils/cookie'

export const destroy = cookie.deleteCookie as (
  c: Context,
  name: Name | SignedName,
  opt?: Options | undefined,
) => string | undefined

export const get = cookie.getCookie as (c: Context, name: Name) => string | undefined

export const getSigned = cookie.getSignedCookie as (
  c: Context,
  secret: string,
  name: SignedName,
) => Promise<string | undefined>

export const set = cookie.setCookie as (
  c: Context,
  name: Name,
  value: string,
  opt?: Options | undefined,
) => void

export async function generateSigned(
  name: SignedName,
  value: string,
  secret: string,
  opt?: Options | undefined,
) {
  return cookie.generateSignedCookie(name, value, secret, opt)
}

export const setSigned = cookie.setSignedCookie as (
  c: Context,
  name: SignedName,
  value: string,
  secret: string,
  opt?: Options | undefined,
) => Promise<void>

export async function parseSigned(cookieHeader: string, secret: string, name: SignedName) {
  const result = await cookieUtils.parseSigned(cookieHeader, secret, name)
  return result[name]
}

export function getDomain(host: string) {
  const parts = host.split('.')
  return `.${parts.slice(-2).join('.')}`
}

export function secureOpts(url: string, host: string, proto?: string | undefined) {
  if ((proto ?? new URL(url).protocol.slice(0, -1)) === 'https')
    return { domain: getDomain(host), secure: true } as const
  return {} as const
}

type Name = 'curl.state'
type SignedName = 'curl.session'
export type Options = CookieOptions
