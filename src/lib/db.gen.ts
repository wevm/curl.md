// Auto-generated from D1 database schema

import type * as k from 'kysely'

export interface DB {
  request: request
  organization: organization
  account: account
  organization_member: organization_member
  api_key: api_key
}

type request = {
  account_id: string | null
  api_key_id: string | null
  city: string | null
  country: string | null
  created_at: k.Generated<string>
  hostname: string
  id: k.Generated<string>
  keywords: string | null
  objective: string | null
  organization_id: string | null
  path: string
  tokens_saved: number | null
  url: string
  user_agent: string | null
}

type organization = {
  created_at: k.Generated<string>
  deleted_at: k.Generated<string | null>
  id: k.Generated<string>
  name: string
  plan: string
  slug: string
  stripe_customer_id: string | null
}

type account = {
  avatar_url: string | null
  created_at: k.Generated<string>
  deleted_at: k.Generated<string | null>
  email: string
  github_id: number
  id: k.Generated<string>
  name: string | null
}

type organization_member = {
  account_id: string
  created_at: k.Generated<string>
  organization_id: string
  role: string
}

type api_key = {
  created_at: k.Generated<string>
  created_by_account_id: string
  deleted_at: k.Generated<string | null>
  id: k.Generated<string>
  key_hash: string
  key_prefix: string
  last_used_at: k.Generated<string | null>
  name: string
  organization_id: string
}

export declare namespace DB {
  type request = k.Selectable<DB['request']>
  type organization = k.Selectable<DB['organization']>
  type account = k.Selectable<DB['account']>
  type organization_member = k.Selectable<DB['organization_member']>
  type api_key = k.Selectable<DB['api_key']>

  export namespace Insertable {
    type request = k.Insertable<DB['request']>
    type organization = k.Insertable<DB['organization']>
    type account = k.Insertable<DB['account']>
    type organization_member = k.Insertable<DB['organization_member']>
    type api_key = k.Insertable<DB['api_key']>
  }

  export namespace Selectable {
    type request = k.Selectable<DB['request']>
    type organization = k.Selectable<DB['organization']>
    type account = k.Selectable<DB['account']>
    type organization_member = k.Selectable<DB['organization_member']>
    type api_key = k.Selectable<DB['api_key']>
  }

  export namespace Updateable {
    type request = k.Updateable<DB['request']>
    type organization = k.Updateable<DB['organization']>
    type account = k.Updateable<DB['account']>
    type organization_member = k.Updateable<DB['organization_member']>
    type api_key = k.Updateable<DB['api_key']>
  }
}
