import type Database from 'better-sqlite3'

/**
 * One-time data migration run after the schema migration: wrap every legacy
 * generation (one with no conversation_id) in its own single-turn conversation,
 * reusing the generation's id as the conversation id so linkage is trivial.
 * Idempotent — rows already linked are skipped, so it is safe on every startup.
 */
export function backfillConversations(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO conversations (id, title, created_at, updated_at)
    SELECT id, substr(prompt, 1, 80), created_at, updated_at
    FROM generations
    WHERE conversation_id IS NULL;

    UPDATE generations SET conversation_id = id WHERE conversation_id IS NULL;
  `)
}
