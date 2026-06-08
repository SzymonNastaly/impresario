import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import type { Generation, GenerationStatus } from '@shared/types'

let db: Database.Database

interface GenerationRow {
  id: string
  type: string
  prompt: string
  model: string
  status: string
  params: string
  assets: string
  error: string | null
  created_at: number
  updated_at: number
}

function rowToGeneration(row: GenerationRow): Generation {
  return {
    id: row.id,
    type: row.type as Generation['type'],
    prompt: row.prompt,
    model: row.model,
    status: row.status as GenerationStatus,
    params: safeParse(row.params, {}),
    assets: safeParse(row.assets, []),
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/** Open the database and run migrations. Call once, after app is ready. */
export function initDb(): void {
  const dbPath = join(app.getPath('userData'), 'impresario.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS generations (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL,
      prompt      TEXT NOT NULL,
      model       TEXT NOT NULL,
      status      TEXT NOT NULL,
      params      TEXT NOT NULL DEFAULT '{}',
      assets      TEXT NOT NULL DEFAULT '[]',
      error       TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_generations_created_at
      ON generations (created_at DESC);
  `)
}

export function getAllGenerations(): Generation[] {
  const rows = db
    .prepare('SELECT * FROM generations ORDER BY created_at DESC')
    .all() as GenerationRow[]
  return rows.map(rowToGeneration)
}

export function getGeneration(id: string): Generation | undefined {
  const row = db.prepare('SELECT * FROM generations WHERE id = ?').get(id) as
    | GenerationRow
    | undefined
  return row ? rowToGeneration(row) : undefined
}

export function insertGeneration(gen: Generation): Generation {
  db.prepare(
    `INSERT INTO generations
       (id, type, prompt, model, status, params, assets, error, created_at, updated_at)
     VALUES
       (@id, @type, @prompt, @model, @status, @params, @assets, @error, @created_at, @updated_at)`
  ).run({
    id: gen.id,
    type: gen.type,
    prompt: gen.prompt,
    model: gen.model,
    status: gen.status,
    params: JSON.stringify(gen.params),
    assets: JSON.stringify(gen.assets),
    error: gen.error,
    created_at: gen.createdAt,
    updated_at: gen.updatedAt
  })
  return gen
}

type GenerationPatch = Partial<Pick<Generation, 'status' | 'assets' | 'error' | 'params'>>

export function updateGeneration(id: string, patch: GenerationPatch): Generation | undefined {
  const existing = getGeneration(id)
  if (!existing) return undefined
  const next: Generation = {
    ...existing,
    ...patch,
    updatedAt: Date.now()
  }
  db.prepare(
    `UPDATE generations
       SET status = @status, assets = @assets, error = @error,
           params = @params, updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id,
    status: next.status,
    assets: JSON.stringify(next.assets),
    error: next.error,
    params: JSON.stringify(next.params),
    updated_at: next.updatedAt
  })
  return next
}

export function deleteGeneration(id: string): void {
  db.prepare('DELETE FROM generations WHERE id = ?').run(id)
}
