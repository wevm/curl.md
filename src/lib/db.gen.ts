// Auto-generated from D1 database schema

import type * as k from 'kysely'

export interface DB {
  request: request
}

type request = {
  city: string | null
  country: string | null
  created_at: k.Generated<string>
  hostname: string
  id: k.Generated<string>
  path: string
  query: string | null
  url: string
  user_agent: string | null
}

export declare namespace DB {
  type request = k.Selectable<DB['request']>

  export namespace Insertable {
    type request = k.Insertable<DB['request']>
  }

  export namespace Selectable {
    type request = k.Selectable<DB['request']>
  }

  export namespace Updateable {
    type request = k.Updateable<DB['request']>
  }
}
