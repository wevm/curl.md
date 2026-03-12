import type { Kysely } from 'kysely'
import type { DB } from '#lib/db.gen.ts'

export async function resolveBillingEntity(
  db: Kysely<DB>,
  entity:
    | { type: 'account'; accountId: string }
    | { type: 'organization'; accountId: string; organizationId: string },
): Promise<
  | {
      ok: true
      balanceMills: number
      stripeCustomerId: string | null
      entityId: string
      entityType: 'account' | 'organization'
    }
  | { ok: false; error: string; status: 400 | 403 | 404 }
> {
  if (entity.type === 'organization') {
    const member = await db
      .selectFrom('organization_member')
      .where('organization_id', '=', entity.organizationId)
      .where('account_id', '=', entity.accountId)
      .select('role')
      .executeTakeFirst()
    if (!member)
      return { ok: false, error: 'organization_access_denied', status: 403 }
    if (member.role !== 'owner' && member.role !== 'admin')
      return { ok: false, error: 'organization_access_denied', status: 403 }

    const org = await db
      .selectFrom('organization')
      .where('id', '=', entity.organizationId)
      .select(['balance_mills', 'stripe_customer_id'])
      .executeTakeFirst()
    if (!org) return { ok: false, error: 'not_found', status: 404 }

    return {
      ok: true,
      balanceMills: org.balance_mills,
      stripeCustomerId: org.stripe_customer_id,
      entityId: entity.organizationId,
      entityType: 'organization',
    }
  }

  const account = await db
    .selectFrom('account')
    .where('id', '=', entity.accountId)
    .select(['balance_mills', 'stripe_customer_id'])
    .executeTakeFirst()
  if (!account) return { ok: false, error: 'not_found', status: 404 }

  return {
    ok: true,
    balanceMills: account.balance_mills,
    stripeCustomerId: account.stripe_customer_id,
    entityId: entity.accountId,
    entityType: 'account',
  }
}
