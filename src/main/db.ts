import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq, desc } from 'drizzle-orm'
import type { Generation } from '@shared/types'
import { generations } from './schema'

let db: BetterSQLite3Database<{ generations: typeof generations }>

/** Open the database and run migrations. Call once, after app is ready. */
export function initDb(): void {
  const dbPath = join(app.getPath('userData'), 'impresario.db')
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema: { generations } })

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
