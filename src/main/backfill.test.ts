import { resolve } from 'path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { backfillConversations } from './backfill'

let sqlite: Database.Database

beforeEach(() => {
  sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  migrate(drizzle(sqlite), { migrationsFolder: resolve(process.cwd(), 'drizzle') })
})

afterEach(() => sqlite.close())

function insertLegacyGeneration(id: string, prompt: string): void {
  sqlite
    .prepare(
      `INSERT INTO generations
        (id, conversation_id, type, prompt, model, status, params, assets, attachments, error, created_at, updated_at)
       VALUES (?, NULL, 'image', ?, 'm', 'completed', '{}', '[]', '[]', NULL, 1000, 1000)`
    )
    .run(id, prompt)
}

test('wraps each legacy generation in its own conversation', () => {
  insertLegacyGeneration('g1', 'a sunset over mountains')
  insertLegacyGeneration('g2', 'a cat astronaut')

  backfillConversations(sqlite)

  const convos = sqlite.prepare('SELECT id, title FROM conversations ORDER BY id').all()
  expect(convos).toEqual([
    { id: 'g1', title: 'a sunset over mountains' },
    { id: 'g2', title: 'a cat astronaut' }
  ])
  const gens = sqlite.prepare('SELECT id, conversation_id FROM generations ORDER BY id').all()
  expect(gens).toEqual([
    { id: 'g1', conversation_id: 'g1' },
    { id: 'g2', conversation_id: 'g2' }
  ])
})

test('is idempotent', () => {
  insertLegacyGeneration('g1', 'hello')
  backfillConversations(sqlite)
  backfillConversations(sqlite)
  const count = sqlite.prepare('SELECT COUNT(*) AS n FROM conversations').get() as { n: number }
  expect(count.n).toBe(1)
})

test('truncates long prompts to 80 chars for the title', () => {
  const long = 'x'.repeat(200)
  insertLegacyGeneration('g1', long)
  backfillConversations(sqlite)
  const row = sqlite.prepare('SELECT title FROM conversations WHERE id = ?').get('g1') as {
    title: string
  }
  expect(row.title.length).toBe(80)
})

test('does not crash when a conversation row already exists for a legacy generation', () => {
  sqlite
    .prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('g1', 'partial', 1000, 1000)
  insertLegacyGeneration('g1', 'hello world')

  expect(() => backfillConversations(sqlite)).not.toThrow()

  const convos = sqlite.prepare('SELECT id FROM conversations WHERE id = ?').all('g1')
  expect(convos.length).toBe(1)
  const gen = sqlite.prepare('SELECT conversation_id FROM generations WHERE id = ?').get('g1') as {
    conversation_id: string
  }
  expect(gen.conversation_id).toBe('g1')
})
