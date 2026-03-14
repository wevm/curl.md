import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Switch account.role from ENUM to CHECK constraint
  await db.schema
    .alterTable('account')
    .alterColumn('role', (col) => col.setDataType('varchar(20)'))
    .execute()
  await db.schema
    .alterTable('account')
    .alterColumn('role', (col) => col.setDefault('user'))
    .execute()
  await sql`ALTER TABLE account ADD CONSTRAINT account_role_chk CHECK (role IN ('crew', 'user'))`.execute(
    db,
  )
  await sql`DROP TYPE account_role`.execute(db)

  // Switch organization_member.role from ENUM to CHECK constraint
  await db.schema
    .alterTable('organization_member')
    .alterColumn('role', (col) => col.setDataType('varchar(20)'))
    .execute()
  await db.schema
    .alterTable('organization_member')
    .alterColumn('role', (col) => col.setDefault('member'))
    .execute()
  await sql`ALTER TABLE organization_member ADD CONSTRAINT organization_member_role_chk CHECK (role IN ('admin', 'member', 'owner'))`.execute(
    db,
  )
  await sql`DROP TYPE organization_member_role`.execute(db)

  // Add REFERENCES to request table (SET NULL on delete)
  await sql`ALTER TABLE request ADD CONSTRAINT request_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL`.execute(
    db,
  )
  await sql`ALTER TABLE request ADD CONSTRAINT request_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES api_key(id) ON DELETE SET NULL`.execute(
    db,
  )
  await sql`ALTER TABLE request ADD CONSTRAINT request_account_id_fkey FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE SET NULL`.execute(
    db,
  )

  // Add missing FK indexes
  await db.schema.createIndex('session_account_id_idx').on('session').column('account_id').execute()
  await db.schema
    .createIndex('organization_member_organization_id_idx')
    .on('organization_member')
    .column('organization_id')
    .execute()
  await db.schema
    .createIndex('organization_member_account_id_idx')
    .on('organization_member')
    .column('account_id')
    .execute()
  await db.schema
    .createIndex('request_organization_id_idx')
    .on('request')
    .column('organization_id')
    .execute()
  await db.schema.createIndex('request_api_key_id_idx').on('request').column('api_key_id').execute()
  await db.schema.createIndex('request_account_id_idx').on('request').column('account_id').execute()

  // Rename existing indexes to {table}_{column}_idx convention
  await sql`ALTER INDEX index_request_hostname RENAME TO request_hostname_idx`.execute(db)
  await sql`ALTER INDEX index_request_created_at RENAME TO request_created_at_idx`.execute(db)
  await sql`ALTER INDEX index_account_provider_account_id RENAME TO account_provider_account_id_idx`.execute(
    db,
  )
  await sql`ALTER INDEX index_account_login RENAME TO account_login_idx`.execute(db)
  await sql`ALTER INDEX index_api_key_organization_id RENAME TO api_key_organization_id_idx`.execute(
    db,
  )
  await sql`ALTER INDEX index_device_code_user_code RENAME TO device_code_user_code_idx`.execute(db)

  // Add missing device_code.status CHECK constraint
  await sql`ALTER TABLE device_code ADD CONSTRAINT device_code_status_chk CHECK (status IN ('approved', 'pending'))`.execute(
    db,
  )

  // Rename unique constraints to {table}_{column(s)}_uq convention
  await sql`ALTER TABLE account RENAME CONSTRAINT account_login_key TO account_login_uq`.execute(db)
  await sql`ALTER TABLE account_provider RENAME CONSTRAINT unique_account_provider_provider TO account_provider_provider_provider_account_id_uq`.execute(
    db,
  )
  await sql`ALTER TABLE api_key RENAME CONSTRAINT api_key_key_hash_key TO api_key_key_hash_uq`.execute(
    db,
  )
  await sql`ALTER TABLE device_code RENAME CONSTRAINT device_code_code_key TO device_code_code_uq`.execute(
    db,
  )
  await sql`ALTER TABLE device_code RENAME CONSTRAINT device_code_user_code_key TO device_code_user_code_uq`.execute(
    db,
  )
  await sql`ALTER TABLE organization RENAME CONSTRAINT organization_login_key TO organization_login_uq`.execute(
    db,
  )
  await sql`ALTER TABLE organization_member RENAME CONSTRAINT unique_organization_member TO organization_member_organization_id_account_id_uq`.execute(
    db,
  )
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Restore unique constraint names
  await sql`ALTER TABLE organization_member RENAME CONSTRAINT organization_member_organization_id_account_id_uq TO unique_organization_member`.execute(
    db,
  )
  await sql`ALTER TABLE organization RENAME CONSTRAINT organization_login_uq TO organization_login_key`.execute(
    db,
  )
  await sql`ALTER TABLE device_code RENAME CONSTRAINT device_code_user_code_uq TO device_code_user_code_key`.execute(
    db,
  )
  await sql`ALTER TABLE device_code RENAME CONSTRAINT device_code_code_uq TO device_code_code_key`.execute(
    db,
  )
  await sql`ALTER TABLE api_key RENAME CONSTRAINT api_key_key_hash_uq TO api_key_key_hash_key`.execute(
    db,
  )
  await sql`ALTER TABLE account_provider RENAME CONSTRAINT account_provider_provider_provider_account_id_uq TO unique_account_provider_provider`.execute(
    db,
  )
  await sql`ALTER TABLE account RENAME CONSTRAINT account_login_uq TO account_login_key`.execute(db)

  // Drop device_code.status CHECK constraint
  await sql`ALTER TABLE device_code DROP CONSTRAINT device_code_status_chk`.execute(db)

  // Restore index names
  await sql`ALTER INDEX device_code_user_code_idx RENAME TO index_device_code_user_code`.execute(db)
  await sql`ALTER INDEX api_key_organization_id_idx RENAME TO index_api_key_organization_id`.execute(
    db,
  )
  await sql`ALTER INDEX account_login_idx RENAME TO index_account_login`.execute(db)
  await sql`ALTER INDEX account_provider_account_id_idx RENAME TO index_account_provider_account_id`.execute(
    db,
  )
  await sql`ALTER INDEX request_created_at_idx RENAME TO index_request_created_at`.execute(db)
  await sql`ALTER INDEX request_hostname_idx RENAME TO index_request_hostname`.execute(db)

  // Drop new FK indexes
  await db.schema.dropIndex('request_account_id_idx').execute()
  await db.schema.dropIndex('request_api_key_id_idx').execute()
  await db.schema.dropIndex('request_organization_id_idx').execute()
  await db.schema.dropIndex('organization_member_account_id_idx').execute()
  await db.schema.dropIndex('organization_member_organization_id_idx').execute()
  await db.schema.dropIndex('session_account_id_idx').execute()

  // Drop request FK constraints
  await sql`ALTER TABLE request DROP CONSTRAINT request_account_id_fkey`.execute(db)
  await sql`ALTER TABLE request DROP CONSTRAINT request_api_key_id_fkey`.execute(db)
  await sql`ALTER TABLE request DROP CONSTRAINT request_organization_id_fkey`.execute(db)

  // Restore organization_member.role ENUM
  await sql`CREATE TYPE organization_member_role AS ENUM ('admin', 'member', 'owner')`.execute(db)
  await sql`ALTER TABLE organization_member DROP CONSTRAINT organization_member_role_chk`.execute(
    db,
  )
  await db.schema
    .alterTable('organization_member')
    .alterColumn('role', (col) => col.dropDefault())
    .execute()
  await db.schema
    .alterTable('organization_member')
    .alterColumn('role', (col) =>
      col.setDataType(sql`organization_member_role USING role::organization_member_role`),
    )
    .execute()
  await db.schema
    .alterTable('organization_member')
    .alterColumn('role', (col) => col.setDefault(sql`'member'::organization_member_role`))
    .execute()

  // Restore account.role ENUM
  await sql`CREATE TYPE account_role AS ENUM ('crew', 'user')`.execute(db)
  await sql`ALTER TABLE account DROP CONSTRAINT account_role_chk`.execute(db)
  await db.schema
    .alterTable('account')
    .alterColumn('role', (col) => col.dropDefault())
    .execute()
  await db.schema
    .alterTable('account')
    .alterColumn('role', (col) => col.setDataType(sql`account_role USING role::account_role`))
    .execute()
  await db.schema
    .alterTable('account')
    .alterColumn('role', (col) => col.setDefault(sql`'user'::account_role`))
    .execute()
}
