import type Database from 'better-sqlite3'

/**
 * One-time data migration run after the schema migration: wrap every legacy
 * generation (one with no conversation_id) in its own single-turn conversation,
 * reusing the generation's id as the conversation id so linkage is trivial.
 * Runs atomically in a transaction so a crash between the INSERT and UPDATE
 * cannot leave the database in a half-done state. INSERT OR IGNORE makes the
 * operation resume-safe: if a conversations row already exists for a given id
 * (from a previously interrupted run) it is skipped, while the UPDATE still
 * links the generation. Idempotent — rows already linked are skipped, so it
 * is safe on every startup.
 */
export function backfillConversations(sqlite: Database.Database): void {
  const run = sqlite.transaction(() => {
    sqlite.exec(`
      INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at)
      SELECT id, substr(prompt, 1, 80), created_at, updated_at
      FROM generations
      WHERE conversation_id IS NULL;

      UPDATE generations SET conversation_id = id WHERE conversation_id IS NULL;
    `)
  })
  run()
}
