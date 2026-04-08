// Auto-generated from database schema

import type * as k from 'kysely'

type Timestamp = k.ColumnType<Date, Date | string, Date | string>
type GeneratedTimestamp = k.ColumnType<Date, Date | string | undefined, Date | string>

export interface DB {
  account: account
  account_provider: account_provider
  api_key: api_key
  credit_transaction: credit_transaction
  device_code: device_code
  organization: organization
  organization_invite: organization_invite
  organization_member: organization_member
  request: request
  session: session
}

type account = {
  avatar_url: string | null
  balance_mills: k.Generated<number>
  created_at: GeneratedTimestamp
  default_payment_method_id: string | null
  deleted_at: Timestamp | null
  email: string
  id: k.Generated<string>
  login: string
  name: string | null
  role: k.Generated<'crew' | 'user'>
  stripe_customer_id: string | null
}

type account_provider = {
  access_token: string | null
  access_token_expires_at: Timestamp | null
  account_id: string
  created_at: GeneratedTimestamp
  id: k.Generated<string>
  provider: string
  provider_account_id: string
  refresh_token: string | null
  refresh_token_expires_at: Timestamp | null
}

type api_key = {
  account_id: string
  created_at: GeneratedTimestamp
  deleted_at: Timestamp | null
  id: k.Generated<string>
  key_hash: string
  key_prefix: string
  last_used_at: Timestamp | null
  name: string
  organization_id: string | null
}

type credit_transaction = {
  account_id: string | null
  amount_mills: number
  balance_after_mills: number
  created_at: GeneratedTimestamp
  id: k.Generated<string>
  organization_id: string | null
  reference_id: string | null
  type: 'chargeback' | 'promo' | 'purchase' | 'refund' | 'request'
}

type device_code = {
  account_id: string | null
  code: string
  created_at: GeneratedTimestamp
  expires_at: Timestamp
  id: k.Generated<string>
  status: k.Generated<'approved' | 'pending'>
  user_code: string
}

type organization = {
  balance_mills: k.Generated<number>
  created_at: GeneratedTimestamp
  default_payment_method_id: string | null
  deleted_at: Timestamp | null
  id: k.Generated<string>
  login: string
  name: string
  stripe_customer_id: string | null
}

type organization_invite = {
  created_at: GeneratedTimestamp
  created_by: string
  deleted_at: Timestamp | null
  expires_at: Timestamp
  id: k.Generated<string>
  max_uses: number | null
  organization_id: string
  role: k.Generated<'admin' | 'member' | 'owner'>
  token: string
  use_count: k.Generated<number>
}

type organization_member = {
  account_id: string
  created_at: GeneratedTimestamp
  id: k.Generated<string>
  organization_id: string
  role: k.Generated<'admin' | 'member' | 'owner'>
}

type request = {
  account_id: string | null
  api_key_id: string | null
  cached: boolean
  created_at: GeneratedTimestamp
  extracted_tokens: number | null
  filtered_tokens: number | null
  hostname: string
  id: k.Generated<string>
  keywords: string | null
  markdown_tokens: k.Generated<number>
  mode: 'rush' | 'smart' | null
  objective: string | null
  organization_id: string | null
  path: string
  source_tokens: k.Generated<number>
  source_tokens_method: k.Generated<'estimated' | 'html' | 'markdown'>
  url: string
  user_agent: string | null
}

type session = {
  account_id: string
  created_at: GeneratedTimestamp
  expires_at: Timestamp
  id: k.Generated<string>
}

export declare namespace DB {
  type account = k.Selectable<DB['account']>
  type account_provider = k.Selectable<DB['account_provider']>
  type api_key = k.Selectable<DB['api_key']>
  type credit_transaction = k.Selectable<DB['credit_transaction']>
  type device_code = k.Selectable<DB['device_code']>
  type organization = k.Selectable<DB['organization']>
  type organization_invite = k.Selectable<DB['organization_invite']>
  type organization_member = k.Selectable<DB['organization_member']>
  type request = k.Selectable<DB['request']>
  type session = k.Selectable<DB['session']>

  export namespace Insertable {
    type account = k.Insertable<DB['account']>
    type account_provider = k.Insertable<DB['account_provider']>
    type api_key = k.Insertable<DB['api_key']>
    type credit_transaction = k.Insertable<DB['credit_transaction']>
    type device_code = k.Insertable<DB['device_code']>
    type organization = k.Insertable<DB['organization']>
    type organization_invite = k.Insertable<DB['organization_invite']>
    type organization_member = k.Insertable<DB['organization_member']>
    type request = k.Insertable<DB['request']>
    type session = k.Insertable<DB['session']>
  }

  export namespace Selectable {
    type account = k.Selectable<DB['account']>
    type account_provider = k.Selectable<DB['account_provider']>
    type api_key = k.Selectable<DB['api_key']>
    type credit_transaction = k.Selectable<DB['credit_transaction']>
    type device_code = k.Selectable<DB['device_code']>
    type organization = k.Selectable<DB['organization']>
    type organization_invite = k.Selectable<DB['organization_invite']>
    type organization_member = k.Selectable<DB['organization_member']>
    type request = k.Selectable<DB['request']>
    type session = k.Selectable<DB['session']>
  }

  export namespace Updateable {
    type account = k.Updateable<DB['account']>
    type account_provider = k.Updateable<DB['account_provider']>
    type api_key = k.Updateable<DB['api_key']>
    type credit_transaction = k.Updateable<DB['credit_transaction']>
    type device_code = k.Updateable<DB['device_code']>
    type organization = k.Updateable<DB['organization']>
    type organization_invite = k.Updateable<DB['organization_invite']>
    type organization_member = k.Updateable<DB['organization_member']>
    type request = k.Updateable<DB['request']>
    type session = k.Updateable<DB['session']>
  }
}
