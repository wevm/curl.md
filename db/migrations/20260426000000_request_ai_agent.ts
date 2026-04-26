import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('request').addColumn('ai_agent', 'text').execute()

  await sql`ALTER TABLE request ADD CONSTRAINT request_ai_agent_chk CHECK (ai_agent IN ('amp', 'claude', 'codex', 'cursor', 'gemini', 'opencode', 'pi'))`.execute(
    db,
  )
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE request DROP CONSTRAINT IF EXISTS request_ai_agent_chk`.execute(db)

  await db.schema.alterTable('request').dropColumn('ai_agent').execute()
}
