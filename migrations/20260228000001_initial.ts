import { type Kysely, sql } from 'kysely'
import {
  account_role,
  nanoid,
  now,
  organization_member_role,
} from '../src/lib/pg.ts'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TYPE account_role AS ENUM ('crew', 'user')`.execute(db)
  await sql`CREATE TYPE organization_member_role AS ENUM ('admin', 'member', 'owner')`.execute(
    db,
  )

  await db.schema
    .createTable('account')
    .addColumn('id', 'varchar(255)', (col) =>
      col.primaryKey().defaultTo(nanoid()),
    )
    .addColumn('email', 'varchar(255)', (col) => col.notNull())
    .addColumn('name', 'varchar(255)')
    .addColumn('avatar_url', 'varchar(255)')
    .addColumn('role', account_role(), (col) =>
      col.notNull().defaultTo(sql`'user'::account_role`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(now()),
    )
    .addColumn('deleted_at', 'timestamptz')
    .execute()

  await db.schema
    .createTable('account_provider')
    .addColumn('id', 'varchar(255)', (col) =>
      col.primaryKey().defaultTo(nanoid()),
    )
    .addColumn('account_id', 'varchar(255)', (col) =>
      col.notNull().references('account.id'),
    )
    .addColumn('provider', 'varchar(255)', (col) => col.notNull())
    .addColumn('provider_account_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('access_token', 'varchar(255)')
    .addColumn('refresh_token', 'varchar(255)')
    .addColumn('access_token_expires_at', 'timestamptz')
    .addColumn('refresh_token_expires_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(now()),
    )
    .addUniqueConstraint('unique_account_provider_provider', [
      'provider',
      'provider_account_id',
    ])
    .execute()

  await db.schema
    .createTable('organization')
    .addColumn('id', 'varchar(255)', (col) =>
      col.primaryKey().defaultTo(nanoid()),
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('slug', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(now()),
    )
    .addColumn('deleted_at', 'timestamptz')
    .execute()

  await db.schema
    .createTable('organization_member')
    .addColumn('id', 'varchar(255)', (col) =>
      col.primaryKey().defaultTo(nanoid()),
    )
    .addColumn('organization_id', 'varchar(255)', (col) =>
      col.notNull().references('organization.id'),
    )
    .addColumn('account_id', 'varchar(255)', (col) =>
      col.notNull().references('account.id'),
    )
    .addColumn('role', organization_member_role(), (col) =>
      col.notNull().defaultTo(sql`'member'::organization_member_role`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(now()),
    )
    .addUniqueConstraint('unique_organization_member', [
      'organization_id',
      'account_id',
    ])
    .execute()

  await db.schema
    .createTable('api_key')
    .addColumn('id', 'varchar(255)', (col) =>
      col.primaryKey().defaultTo(nanoid()),
    )
    .addColumn('organization_id', 'varchar(255)', (col) =>
      col.notNull().references('organization.id'),
    )
    .addColumn('account_id', 'varchar(255)', (col) =>
      col.notNull().references('account.id'),
    )
    .addColumn('key_prefix', 'varchar(255)', (col) => col.notNull())
    .addColumn('key_hash', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(now()),
    )
    .addColumn('deleted_at', 'timestamptz')
    .execute()

  await db.schema
    .createTable('request')
    .addColumn('id', 'varchar(255)', (col) =>
      col.primaryKey().defaultTo(nanoid()),
    )
    .addColumn('url', 'text', (col) => col.notNull())
    .addColumn('hostname', 'varchar(255)', (col) => col.notNull())
    .addColumn('path', 'text', (col) => col.notNull())
    .addColumn('objective', 'text')
    .addColumn('user_agent', 'text')
    .addColumn('tokens_saved', 'integer')
    .addColumn('keywords', 'text')
    .addColumn('organization_id', 'varchar(255)')
    .addColumn('api_key_id', 'varchar(255)')
    .addColumn('account_id', 'varchar(255)')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(now()),
    )
    .execute()

  await db.schema
    .createTable('session')
    .addColumn('id', 'varchar(255)', (col) =>
      col.primaryKey().defaultTo(nanoid()),
    )
    .addColumn('account_id', 'varchar(255)', (col) =>
      col.notNull().references('account.id'),
    )
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(now()),
    )
    .execute()

  await db.schema
    .createIndex('index_request_hostname')
    .on('request')
    .column('hostname')
    .execute()

  await db.schema
    .createIndex('index_request_created_at')
    .on('request')
    .column('created_at')
    .execute()

  await db.schema
    .createIndex('index_account_provider_account_id')
    .on('account_provider')
    .column('account_id')
    .execute()

  await db.schema
    .createIndex('index_api_key_organization_id')
    .on('api_key')
    .column('organization_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('index_api_key_organization_id').execute()
  await db.schema.dropIndex('index_account_provider_account_id').execute()
  await db.schema.dropIndex('index_request_created_at').execute()
  await db.schema.dropIndex('index_request_hostname').execute()

  await db.schema.dropTable('session').execute()
  await db.schema.dropTable('request').execute()
  await db.schema.dropTable('api_key').execute()
  await db.schema.dropTable('organization_member').execute()
  await db.schema.dropTable('organization').execute()
  await db.schema.dropTable('account_provider').execute()
  await db.schema.dropTable('account').execute()

  await sql`DROP TYPE organization_member_role`.execute(db)
  await sql`DROP TYPE account_role`.execute(db)
}
