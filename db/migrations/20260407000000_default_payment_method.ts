import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('account').addColumn('default_payment_method_id', 'text').execute()
  await db.schema
    .alterTable('organization')
    .addColumn('default_payment_method_id', 'text')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('organization').dropColumn('default_payment_method_id').execute()
  await db.schema.alterTable('account').dropColumn('default_payment_method_id').execute()
}
