// Auto-generated from database schema

import { z } from 'zod'

export const account = z.object({
  avatar_url: z.string().nullable(),
  balance_mills: z.number(),
  created_at: z.date(),
  default_payment_method_id: z.string().nullable(),
  deleted_at: z.date().nullable(),
  email: z.string(),
  id: z.string(),
  login: z.string(),
  name: z.string().nullable(),
  role: z.enum(['crew', 'user']),
  stripe_customer_id: z.string().nullable(),
})

export const account_provider = z.object({
  access_token: z.string().nullable(),
  access_token_expires_at: z.date().nullable(),
  account_id: z.string(),
  created_at: z.date(),
  id: z.string(),
  provider: z.string(),
  provider_account_id: z.string(),
  refresh_token: z.string().nullable(),
  refresh_token_expires_at: z.date().nullable(),
})

export const api_key = z.object({
  account_id: z.string(),
  created_at: z.date(),
  deleted_at: z.date().nullable(),
  id: z.string(),
  key_hash: z.string(),
  key_prefix: z.string(),
  last_used_at: z.date().nullable(),
  name: z.string(),
  organization_id: z.string().nullable(),
})

export const credit_transaction = z.object({
  account_id: z.string().nullable(),
  amount_mills: z.number(),
  balance_after_mills: z.number(),
  created_at: z.date(),
  id: z.string(),
  organization_id: z.string().nullable(),
  reference_id: z.string().nullable(),
  type: z.enum(['chargeback', 'promo', 'purchase', 'refund', 'request']),
})

export const device_code = z.object({
  account_id: z.string().nullable(),
  code: z.string(),
  created_at: z.date(),
  expires_at: z.date(),
  id: z.string(),
  status: z.enum(['approved', 'pending']),
  user_code: z.string(),
})

export const organization = z.object({
  balance_mills: z.number(),
  created_at: z.date(),
  default_payment_method_id: z.string().nullable(),
  deleted_at: z.date().nullable(),
  id: z.string(),
  login: z.string(),
  name: z.string(),
  stripe_customer_id: z.string().nullable(),
})

export const organization_invite = z.object({
  created_at: z.date(),
  created_by: z.string(),
  deleted_at: z.date().nullable(),
  expires_at: z.date(),
  id: z.string(),
  max_uses: z.number().nullable(),
  organization_id: z.string(),
  role: z.enum(['admin', 'member', 'owner']),
  token: z.string(),
  use_count: z.number(),
})

export const organization_member = z.object({
  account_id: z.string(),
  created_at: z.date(),
  id: z.string(),
  organization_id: z.string(),
  role: z.enum(['admin', 'member', 'owner']),
})

export const request = z.object({
  account_id: z.string().nullable(),
  ai_agent: z.enum(['amp', 'claude', 'codex', 'cursor', 'gemini', 'opencode', 'pi']).nullable(),
  api_key_id: z.string().nullable(),
  cached: z.boolean(),
  created_at: z.date(),
  extracted_tokens: z.number().nullable(),
  filtered_tokens: z.number().nullable(),
  hostname: z.string(),
  id: z.string(),
  keywords: z.string().nullable(),
  markdown_tokens: z.number(),
  mode: z.enum(['rush', 'smart']).nullable(),
  objective: z.string().nullable(),
  organization_id: z.string().nullable(),
  path: z.string(),
  source_tokens: z.number(),
  source_tokens_method: z.enum(['estimated', 'html', 'markdown']),
  url: z.string(),
  user_agent: z.string().nullable(),
})

export const session = z.object({
  account_id: z.string(),
  created_at: z.date(),
  expires_at: z.date(),
  id: z.string(),
  refresh_token_hash: z.string().nullable(),
  session_type: z.enum(['browser', 'cli']),
})

export const session_access_token = z.object({
  created_at: z.date(),
  expires_at: z.date(),
  id: z.string(),
  session_id: z.string(),
  token_hash: z.string(),
})

export const db = {
  account: account,
  account_provider: account_provider,
  api_key: api_key,
  credit_transaction: credit_transaction,
  device_code: device_code,
  organization: organization,
  organization_invite: organization_invite,
  organization_member: organization_member,
  request: request,
  session: session,
  session_access_token: session_access_token,
}
