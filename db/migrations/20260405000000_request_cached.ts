import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('request').addColumn('cached', 'boolean').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('request').dropColumn('cached').execute()
}
