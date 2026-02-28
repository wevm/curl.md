import type { Context } from 'hono'
import * as cookie from 'hono/cookie'
import type { CookieOptions } from 'hono/utils/cookie'

export const destroy = cookie.deleteCookie as (
  c: Context,
  name: Name,
  opt?: Options | undefined,
) => string | undefined

export const get = cookie.getCookie as (
  c: Context,
  name: Name,
) => string | undefined

export const set = cookie.setCookie as (
  c: Context,
  name: Name,
  value: string,
  opt?: Options | undefined,
) => void

export function getDomain(host: string) {
  const parts = host.split('.')
  return `.${parts.slice(-2).join('.')}`
}

type Name = 'curl.session' | 'curl.state'
export type Options = CookieOptions
