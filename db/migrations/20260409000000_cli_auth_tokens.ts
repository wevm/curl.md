import { type Kysely, sql } from 'kysely'
import { nanoid, now } from '../utils.ts'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('session')
    .addColumn('refresh_token_hash', 'varchar(255)')
    .addColumn('session_type', 'varchar(20)', (col) =>
      col
        .notNull()
        .defaultTo('browser')
        .check(sql`session_type in ('browser', 'cli')`),
    )
    .execute()

  await db.schema
    .createIndex('session_refresh_token_hash_idx')
    .on('session')
    .column('refresh_token_hash')
    .execute()

  await db.schema
    .createTable('session_access_token')
    .addColumn('id', 'varchar(20)', (col) => col.primaryKey().defaultTo(nanoid()))
    .addColumn('session_id', 'varchar(20)', (col) =>
      col.notNull().references('session.id').onDelete('cascade'),
    )
    .addColumn('token_hash', 'varchar(255)', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(now()))
    .execute()

  await db.schema
    .createIndex('session_access_token_token_hash_idx')
    .on('session_access_token')
    .column('token_hash')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('session_access_token_token_hash_idx').execute()
  await db.schema.dropTable('session_access_token').execute()
  await db.schema.dropIndex('session_refresh_token_hash_idx').execute()

  await db.schema
    .alterTable('session')
    .dropColumn('session_type')
    .dropColumn('refresh_token_hash')
    .execute()
}
