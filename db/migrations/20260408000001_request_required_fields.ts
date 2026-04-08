import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE request
    SET
      cached = COALESCE(cached, false),
      markdown_tokens = COALESCE(markdown_tokens, filtered_tokens, extracted_tokens, source_tokens, 0),
      source_tokens = COALESCE(source_tokens, markdown_tokens, filtered_tokens, extracted_tokens, 0),
      source_tokens_basis = COALESCE(source_tokens_basis, 'estimated')
    WHERE cached IS NULL
      OR markdown_tokens IS NULL
      OR source_tokens IS NULL
      OR source_tokens_basis IS NULL
  `.execute(db)

  await sql`ALTER TABLE request ALTER COLUMN cached SET NOT NULL`.execute(db)
  await sql`ALTER TABLE request ALTER COLUMN markdown_tokens SET NOT NULL`.execute(db)
  await sql`ALTER TABLE request ALTER COLUMN source_tokens SET NOT NULL`.execute(db)
  await sql`ALTER TABLE request ALTER COLUMN source_tokens_basis SET NOT NULL`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE request ALTER COLUMN source_tokens_basis DROP NOT NULL`.execute(db)
  await sql`ALTER TABLE request ALTER COLUMN source_tokens DROP NOT NULL`.execute(db)
  await sql`ALTER TABLE request ALTER COLUMN markdown_tokens DROP NOT NULL`.execute(db)
  await sql`ALTER TABLE request ALTER COLUMN cached DROP NOT NULL`.execute(db)
}
