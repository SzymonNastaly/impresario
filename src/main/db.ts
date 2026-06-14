import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq, desc } from 'drizzle-orm'
import type {
  Conversation,
  ConversationUpdate,
  Generation,
  Template,
  TemplateUpdate
} from '@shared/types'
import { conversations, generations, templates } from './schema'
import { backfillConversations } from './backfill'

let sqlite: Database.Database
let db: BetterSQLite3Database<{
  conversations: typeof conversations
  generations: typeof generations
  templates: typeof templates
}>

/**
 * Open a database at `dbPath`, run schema migrations from `migrationsFolder`,
 * then run the idempotent conversation backfill. Extracted so tests can open an
 * in-memory database with the real migrations.
 */
export function openDatabase(dbPath: string, migrationsFolder: string): void {
  sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema: { conversations, generations, templates } })
  migrate(db, { migrationsFolder })
  backfillConversations(sqlite)
}

/** Close the underlying connection (used by tests for isolation). */
export function closeDatabase(): void {
  sqlite?.close()
}

/** Open the database and run migrations. Call once, after app is ready. */
export function initDb(): void {
  // Migration SQL lives in ./drizzle (next to package.json), which ships inside
  // the app bundle, so the same path resolves in dev and packaged builds.
  openDatabase(
    join(app.getPath('userData'), 'impresario.db'),
    join(app.getAppPath(), 'drizzle')
  )
}

// The `generations.conversationId` column is nullable at the DB level only
// because SQLite cannot add a NOT NULL column to a populated table without a
// full table rebuild. The startup backfill links every legacy row and the app
// always sets it on insert, so in practice it is never null — hence the casts
// from Drizzle's inferred `string | null` to the `Generation` type's `string`.
export function getAllGenerations(): Generation[] {
  return db.select().from(generations).orderBy(desc(generations.createdAt)).all() as Generation[]
}

export function getGeneration(id: string): Generation | undefined {
  return db.select().from(generations).where(eq(generations.id, id)).get() as
    | Generation
    | undefined
}

export function insertGeneration(gen: Generation): Generation {
  db.insert(generations).values(gen).run()
  return gen
}

type GenerationPatch = Partial<Pick<Generation, 'status' | 'assets' | 'error' | 'params'>>

export function updateGeneration(id: string, patch: GenerationPatch): Generation | undefined {
  return db
    .update(generations)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(generations.id, id))
    .returning()
    .get() as Generation | undefined
}

export function deleteGeneration(id: string): void {
  db.delete(generations).where(eq(generations.id, id)).run()
}

export function getGenerationsByConversation(conversationId: string): Generation[] {
  return db
    .select()
    .from(generations)
    .where(eq(generations.conversationId, conversationId))
    .orderBy(desc(generations.createdAt))
    .all() as Generation[]
}

export function getAllConversations(): Conversation[] {
  return db.select().from(conversations).orderBy(desc(conversations.createdAt)).all()
}

export function getConversation(id: string): Conversation | undefined {
  return db.select().from(conversations).where(eq(conversations.id, id)).get()
}

export function insertConversation(conv: Conversation): Conversation {
  db.insert(conversations).values(conv).run()
  return conv
}

export function updateConversation(
  id: string,
  patch: ConversationUpdate
): Conversation | undefined {
  return db
    .update(conversations)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(conversations.id, id))
    .returning()
    .get()
}

/**
 * Delete a conversation and all of its generations. Generations are removed
 * first to satisfy the foreign key. Returns the deleted generation ids so the
 * caller can clean up their media folders.
 */
export function deleteConversation(id: string): string[] {
  const ids = getGenerationsByConversation(id).map((g) => g.id)
  db.delete(generations).where(eq(generations.conversationId, id)).run()
  db.delete(conversations).where(eq(conversations.id, id)).run()
  return ids
}

export function getAllTemplates(): Template[] {
  return db.select().from(templates).orderBy(desc(templates.createdAt)).all()
}

export function getTemplate(id: string): Template | undefined {
  return db.select().from(templates).where(eq(templates.id, id)).get()
}

export function insertTemplate(t: Template): Template {
  db.insert(templates).values(t).run()
  return t
}

export function updateTemplate(id: string, patch: TemplateUpdate): Template | undefined {
  return db
    .update(templates)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(templates.id, id))
    .returning()
    .get()
}

export function deleteTemplate(id: string): void {
  db.delete(templates).where(eq(templates.id, id)).run()
}
