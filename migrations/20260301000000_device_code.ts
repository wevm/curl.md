import { type Kysely, sql } from 'kysely'
import { nanoid, now } from '../src/lib/pg.ts'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('device_code')
    .addColumn('id', 'varchar(20)', (col) =>
      col.primaryKey().defaultTo(nanoid()),
    )
    .addColumn('code', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('user_code', 'varchar(8)', (col) => col.notNull().unique())
    .addColumn('account_id', 'varchar(20)', (col) =>
      col.references('account.id'),
    )
    .addColumn('status', 'varchar(20)', (col) =>
      col
        .notNull()
        .defaultTo('pending')
        .check(sql`status in ('approved', 'pending')`),
    )
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(now()),
    )
    .execute()

  await db.schema
    .createIndex('index_device_code_user_code')
    .on('device_code')
    .column('user_code')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('index_device_code_user_code').execute()
  await db.schema.dropTable('device_code').execute()
}
