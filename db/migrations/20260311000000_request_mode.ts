import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('request')
    .addColumn('mode', 'text', (col) =>
      col.check(sql`mode IN ('rush', 'smart')`),
    )
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('request').dropColumn('mode').execute()
}
