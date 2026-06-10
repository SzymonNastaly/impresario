import { desc } from 'drizzle-orm'
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
// Relative import (not the @shared alias): drizzle-kit compiles this file with
// its own bundler during `db:generate` and doesn't know our tsconfig paths.
import type {
  GenerationType,
  GenerationStatus,
  GenerationAsset,
  TemplateKind,
  TemplateConfig
} from '../shared/types'

// Drizzle schema is the source of truth for the SQLite tables. Generate
// migrations from it with `pnpm db:generate`; they run at startup (see db.ts).
//
// `params` and `assets` use json mode, so Drizzle handles the
// stringify/parse marshalling that used to be done by hand.
export const generations = sqliteTable(
  'generations',
  {
    id: text('id').primaryKey(),
    type: text('type').$type<GenerationType>().notNull(),
    prompt: text('prompt').notNull(),
    model: text('model').notNull(),
    status: text('status').$type<GenerationStatus>().notNull(),
    params: text('params', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
    assets: text('assets', { mode: 'json' }).$type<GenerationAsset[]>().notNull().default([]),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => [index('idx_generations_created_at').on(desc(table.createdAt))]
)

export const templates = sqliteTable(
  'templates',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind').$type<TemplateKind>().notNull().default('single-prompt'),
    config: text('config', { mode: 'json' }).$type<TemplateConfig>().notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => [index('idx_templates_created_at').on(desc(table.createdAt))]
)
