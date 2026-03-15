import { type Kysely, sql } from 'kysely'
import { nanoid, now } from '../utils.ts'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('organization_invite')
    .addColumn('id', 'varchar(20)', (col) => col.primaryKey().defaultTo(nanoid()))
    .addColumn('organization_id', 'varchar(20)', (col) =>
      col.notNull().references('organization.id'),
    )
    .addColumn('token', 'varchar(64)', (col) => col.notNull().unique())
    .addColumn('role', 'varchar(20)', (col) => col.notNull().defaultTo('member'))
    .addColumn('created_by', 'varchar(20)', (col) => col.notNull().references('account.id'))
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('max_uses', 'integer')
    .addColumn('use_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(now()))
    .addColumn('deleted_at', 'timestamptz')
    .execute()

  await sql`ALTER TABLE organization_invite ADD CONSTRAINT organization_invite_role_chk CHECK (role IN ('admin', 'member', 'owner'))`.execute(
    db,
  )

  await db.schema
    .createIndex('organization_invite_organization_id_idx')
    .on('organization_invite')
    .column('organization_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('organization_invite').execute()
}
