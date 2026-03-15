import { type Kysely, sql } from 'kysely'
import { nanoid, now } from '../utils.ts'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('account')
    .addColumn('balance_mills', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('stripe_customer_id', 'text')
    .execute()

  await db.schema
    .alterTable('organization')
    .addColumn('balance_mills', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('stripe_customer_id', 'text')
    .execute()

  await db.schema
    .createTable('credit_transaction')
    .addColumn('id', 'varchar(20)', (col) => col.primaryKey().defaultTo(nanoid()))
    .addColumn('account_id', 'varchar(20)', (col) => col.references('account.id'))
    .addColumn('organization_id', 'varchar(20)', (col) => col.references('organization.id'))
    .addColumn('amount_mills', 'integer', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('reference_id', 'text')
    .addColumn('balance_after_mills', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(now()))
    .execute()

  await sql`ALTER TABLE credit_transaction ADD CONSTRAINT credit_transaction_type_chk CHECK (type IN ('chargeback', 'promo', 'purchase', 'refund', 'request'))`.execute(
    db,
  )

  await sql`ALTER TABLE credit_transaction ADD CONSTRAINT credit_transaction_owner_chk CHECK ((account_id IS NOT NULL AND organization_id IS NULL) OR (account_id IS NULL AND organization_id IS NOT NULL))`.execute(
    db,
  )

  await db.schema
    .createIndex('credit_transaction_account_id_idx')
    .on('credit_transaction')
    .column('account_id')
    .execute()

  await db.schema
    .createIndex('credit_transaction_organization_id_idx')
    .on('credit_transaction')
    .column('organization_id')
    .execute()

  await sql`CREATE UNIQUE INDEX account_stripe_customer_id_uq ON account (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL`.execute(
    db,
  )

  await sql`CREATE UNIQUE INDEX organization_stripe_customer_id_uq ON organization (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL`.execute(
    db,
  )

  await sql`CREATE UNIQUE INDEX credit_transaction_reference_id_type_uq ON credit_transaction (reference_id, type) WHERE reference_id IS NOT NULL`.execute(
    db,
  )
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS credit_transaction_reference_id_type_uq`.execute(db)
  await sql`DROP INDEX IF EXISTS organization_stripe_customer_id_uq`.execute(db)
  await sql`DROP INDEX IF EXISTS account_stripe_customer_id_uq`.execute(db)

  await db.schema.dropTable('credit_transaction').execute()

  await db.schema
    .alterTable('organization')
    .dropColumn('balance_mills')
    .dropColumn('stripe_customer_id')
    .execute()

  await db.schema
    .alterTable('account')
    .dropColumn('balance_mills')
    .dropColumn('stripe_customer_id')
    .execute()
}
