import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('request')
    .addColumn('extracted_tokens', 'integer')
    .addColumn('filtered_tokens', 'integer')
    .addColumn('markdown_tokens', 'integer')
    .addColumn('source_tokens', 'integer')
    .addColumn('source_tokens_basis', 'text')
    .execute()

  await sql`ALTER TABLE request ADD CONSTRAINT request_source_tokens_basis_chk CHECK (source_tokens_basis IN ('browser_html', 'estimated', 'html', 'markdown', 'shortcut_fallback'))`.execute(
    db,
  )

  await sql`
    UPDATE request
    SET
      markdown_tokens = 0,
      source_tokens = tokens_saved,
      source_tokens_basis = 'estimated'
    WHERE tokens_saved IS NOT NULL
  `.execute(db)

  await db.schema.alterTable('request').dropColumn('tokens_saved').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('request').addColumn('tokens_saved', 'integer').execute()

  await sql`
    UPDATE request
    SET tokens_saved = source_tokens - COALESCE(extracted_tokens, filtered_tokens, markdown_tokens)
    WHERE source_tokens IS NOT NULL
      AND COALESCE(extracted_tokens, filtered_tokens, markdown_tokens) IS NOT NULL
  `.execute(db)

  await sql`ALTER TABLE request DROP CONSTRAINT IF EXISTS request_source_tokens_basis_chk`.execute(
    db,
  )

  await db.schema
    .alterTable('request')
    .dropColumn('source_tokens_basis')
    .dropColumn('source_tokens')
    .dropColumn('markdown_tokens')
    .dropColumn('filtered_tokens')
    .dropColumn('extracted_tokens')
    .execute()
}
