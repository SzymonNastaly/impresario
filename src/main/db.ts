import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq, desc } from 'drizzle-orm'
import type { Generation, Template, TemplateUpdate } from '@shared/types'
import { generations, templates } from './schema'

let db: BetterSQLite3Database<{
  generations: typeof generations
  templates: typeof templates
}>

/** Open the database and run migrations. Call once, after app is ready. */
export function initDb(): void {
  const dbPath = join(app.getPath('userData'), 'impresario.db')
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema: { generations, templates } })

  // Migration SQL lives in ./drizzle (next to package.json), which ships inside
  // the app bundle, so the same path resolves in dev and packaged builds.
  migrate(db, { migrationsFolder: join(app.getAppPath(), 'drizzle') })
}

export function getAllGenerations(): Generation[] {
  return db.select().from(generations).orderBy(desc(generations.createdAt)).all()
}

export function getGeneration(id: string): Generation | undefined {
  return db.select().from(generations).where(eq(generations.id, id)).get()
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
    .get()
}

export function deleteGeneration(id: string): void {
  db.delete(generations).where(eq(generations.id, id)).run()
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
