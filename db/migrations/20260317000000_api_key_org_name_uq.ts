import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX api_key_account_id_name_uq`.execute(db)
  await sql`CREATE UNIQUE INDEX api_key_account_id_org_name_uq ON api_key (account_id, COALESCE(organization_id, ''), name) WHERE deleted_at IS NULL`.execute(
    db,
  )
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX api_key_account_id_org_name_uq`.execute(db)
  await sql`CREATE UNIQUE INDEX api_key_account_id_name_uq ON api_key (account_id, name) WHERE deleted_at IS NULL`.execute(
    db,
  )
}
