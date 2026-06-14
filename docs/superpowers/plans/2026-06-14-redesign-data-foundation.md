# Redesign Data Foundation (Spec A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce multi-turn conversations, rich model metadata, and a reference-files attachment type in the data/IPC layer, leaving the UI unchanged.

**Architecture:** Add a `conversations` table parenting the existing `generations` (each generation = one turn). Enrich the model registry in `@shared/types` with `ModelInfo`. Backfill legacy generations into single-turn conversations via an idempotent code migration run after Drizzle's schema migration. Expose conversation CRUD over IPC and a renderer synced collection. The current chat layout keeps working throughout.

**Tech Stack:** Electron, TypeScript, Drizzle ORM + better-sqlite3 (SQLite), @tanstack/react-db, Vitest (new, for data-layer unit tests).

---

## Spec reference

Implements `docs/superpowers/specs/2026-06-14-redesign-data-foundation-design.md`.

## File map

- Create: `vitest.config.ts` — Vitest config with `@shared`/`@main` aliases.
- Create: `src/main/backfill.ts` — idempotent legacy→conversation backfill.
- Create: `src/main/backfill.test.ts`, `src/shared/models.test.ts`, `src/main/db.test.ts` — unit tests.
- Create: `src/renderer/src/lib/conversations.ts` — renderer synced collection.
- Modify: `src/shared/types.ts` — `ModelInfo`, `Conversation*`, `Attachment`, request fields, IPC channels.
- Modify: `src/shared/api.ts` — conversations API surface + generate return type.
- Modify: `src/main/schema.ts` — `conversations` table; `conversationId` + `attachments` on `generations`.
- Modify: `src/main/db.ts` — `openDatabase` + conversation CRUD + by-conversation query + backfill call.
- Modify: `src/main/storage.ts` — `saveInputAsset` helper.
- Modify: `src/main/ipc.ts` — conversation handlers; wire `conversationId` into generate.
- Modify: `src/preload/index.ts` — expose conversations API.
- Modify: `package.json` — `test` script + Vitest devDep.
- Generated: `drizzle/0002_*.sql` — via `pnpm db:generate`.

---

## Task 1: Vitest setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/shared/sanity.test.ts` (temporary)

- [ ] **Step 1: Install Vitest**

```bash
pnpm add -D vitest
```

- [ ] **Step 2: Add the test script**

In `package.json`, inside `"scripts"`, add after the `"typecheck"` line:

```json
    "test": "vitest run",
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Vitest runs the data layer in plain Node (no Electron). Aliases mirror
// electron.vite.config.ts so test imports resolve like production code.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(process.cwd(), 'src/shared'),
      '@main': resolve(process.cwd(), 'src/main')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
```

- [ ] **Step 4: Add a temporary sanity test**

Create `src/shared/sanity.test.ts`:

```ts
import { expect, test } from 'vitest'

test('vitest runs', () => {
  expect(1 + 1).toBe(2)
})
```

- [ ] **Step 5: Run the test**

Run: `pnpm test`
Expected: PASS (1 test passed).

- [ ] **Step 6: Delete the sanity test and commit**

```bash
rm src/shared/sanity.test.ts
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "test: add vitest for data-layer units"
```

---

## Task 2: Model registry metadata

**Files:**
- Modify: `src/shared/types.ts:96-119`
- Test: `src/shared/models.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/models.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  ALL_MODELS,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_MODELS,
  DEFAULT_VIDEO_MODELS,
  modelInfo,
  modelKind
} from './types'

describe('model registry', () => {
  test('image and video models carry metadata', () => {
    for (const m of [...DEFAULT_IMAGE_MODELS, ...DEFAULT_VIDEO_MODELS]) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(Array.isArray(m.tags)).toBe(true)
      expect(['fast', 'medium', 'slow']).toContain(m.speed)
      expect([1, 2, 3]).toContain(m.cost)
      expect(typeof m.acceptsReferenceFiles).toBe('boolean')
    }
  })

  test('ALL_MODELS unions both kinds', () => {
    expect(ALL_MODELS.length).toBe(DEFAULT_IMAGE_MODELS.length + DEFAULT_VIDEO_MODELS.length)
  })

  test('modelInfo looks up by id', () => {
    expect(modelInfo(DEFAULT_IMAGE_MODEL)?.kind).toBe('image')
    expect(modelInfo('does-not-exist')).toBeUndefined()
  })

  test('modelKind derives from the registry, defaulting to image', () => {
    expect(modelKind(DEFAULT_VIDEO_MODELS[0].id)).toBe('video')
    expect(modelKind(DEFAULT_IMAGE_MODEL)).toBe('image')
    expect(modelKind('unknown/model')).toBe('image')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/shared/models.test.ts`
Expected: FAIL (`modelInfo`/`ALL_MODELS` not exported; metadata fields missing).

- [ ] **Step 3: Replace the model registry**

In `src/shared/types.ts`, replace the block from `/** A curated default set of fal models to start with. */` through the end of the `modelKind` function (lines 96-119) with:

```ts
/** Static, user-facing metadata for a model the app offers. */
export interface ModelInfo {
  id: string
  label: string
  kind: GenerationType
  /** Strength / best-for chips shown in the selector. */
  tags: string[]
  speed: 'fast' | 'medium' | 'slow'
  /** Relative cost: 1 = $, 2 = $$, 3 = $$$. */
  cost: 1 | 2 | 3
  /** Whether the model accepts reference-file inputs (gates the UI in Spec B). */
  acceptsReferenceFiles: boolean
  /** Max output duration in seconds, for video models. */
  maxDurationSec?: number
}

/** A curated default set of fal image models to start with. */
export const DEFAULT_IMAGE_MODELS: ModelInfo[] = [
  {
    id: 'fal-ai/flux-2/flash',
    label: 'FLUX.2 Flash',
    kind: 'image',
    tags: ['Fast drafts', 'Concept art'],
    speed: 'fast',
    cost: 1,
    acceptsReferenceFiles: false
  },
  {
    id: 'fal-ai/nano-banana-2',
    label: 'Nano Banana 2',
    kind: 'image',
    tags: ['Balanced', 'Versatile'],
    speed: 'fast',
    cost: 1,
    acceptsReferenceFiles: false
  },
  {
    id: 'openai/gpt-image-2',
    label: 'GPT Image 2',
    kind: 'image',
    tags: ['Text in images', 'Prompt accuracy'],
    speed: 'medium',
    cost: 3,
    acceptsReferenceFiles: false
  },
  {
    id: 'fal-ai/recraft/v4/text-to-image',
    label: 'Recraft V4',
    kind: 'image',
    tags: ['Logos & vectors', 'Design'],
    speed: 'medium',
    cost: 2,
    acceptsReferenceFiles: false
  }
]

export const DEFAULT_IMAGE_MODEL = DEFAULT_IMAGE_MODELS[0].id

/** A curated default set of fal video models to start with. */
export const DEFAULT_VIDEO_MODELS: ModelInfo[] = [
  {
    id: 'fal-ai/veo3/fast',
    label: 'Veo 3 Fast',
    kind: 'video',
    tags: ['Cinematic', 'With audio'],
    speed: 'medium',
    cost: 3,
    acceptsReferenceFiles: false,
    maxDurationSec: 8
  },
  {
    id: 'fal-ai/kling-video/v2/master/text-to-video',
    label: 'Kling 2 Master',
    kind: 'video',
    tags: ['Smooth motion', 'Detailed'],
    speed: 'slow',
    cost: 3,
    acceptsReferenceFiles: false,
    maxDurationSec: 10
  },
  {
    id: 'fal-ai/minimax/hailuo-02/standard/text-to-video',
    label: 'Hailuo 02',
    kind: 'video',
    tags: ['Expressive', 'Affordable'],
    speed: 'medium',
    cost: 2,
    acceptsReferenceFiles: false,
    maxDurationSec: 6
  },
  {
    id: 'fal-ai/luma-dream-machine',
    label: 'Luma Dream Machine',
    kind: 'video',
    tags: ['Dreamy', 'Fast'],
    speed: 'fast',
    cost: 2,
    acceptsReferenceFiles: false,
    maxDurationSec: 5
  }
]

export const DEFAULT_VIDEO_MODEL = DEFAULT_VIDEO_MODELS[0].id

/** Every model the app offers, both kinds. */
export const ALL_MODELS: ModelInfo[] = [...DEFAULT_IMAGE_MODELS, ...DEFAULT_VIDEO_MODELS]

/** Look up a model's metadata by id. */
export function modelInfo(id: string): ModelInfo | undefined {
  return ALL_MODELS.find((m) => m.id === id)
}

/** Which generation kind a model id belongs to (defaults to image). */
export function modelKind(id: string): GenerationType {
  return modelInfo(id)?.kind ?? 'image'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/shared/models.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the existing consumer still typechecks**

`PromptBar.tsx` maps `DEFAULT_IMAGE_MODELS`/`DEFAULT_VIDEO_MODELS` reading `m.id`/`m.label`, which `ModelInfo` still provides.

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/models.test.ts
git commit -m "feat(types): model registry metadata (ModelInfo)"
```

---

## Task 3: Conversation + Attachment types, request fields, IPC channels

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add the Attachment type and extend Generation**

In `src/shared/types.ts`, replace the `GenerationAsset` interface (lines 8-14) and the `Generation` interface (lines 16-28) with:

```ts
export interface GenerationAsset {
  /** Filename within the generation's media folder (e.g. "0.png"). */
  fileName: string
  /** Custom-protocol URL the renderer can use directly in <img src>. */
  url: string
  contentType: string
}

/** A reference-file input attached to a generation (Spec B captures these). */
export interface Attachment {
  /** Filename within the generation's input/ folder (e.g. "0.png"). */
  fileName: string
  /** Custom-protocol URL the renderer can render directly. */
  url: string
  contentType: string
}

export interface Generation {
  id: string
  /** Parent conversation (turn ordering is by createdAt). */
  conversationId: string
  type: GenerationType
  prompt: string
  model: string
  status: GenerationStatus
  /** Provider/request parameters (size, numberOfImages, seed, ...). */
  params: Record<string, unknown>
  assets: GenerationAsset[]
  /** Reference-file inputs (not sent to fal yet). */
  attachments: Attachment[]
  error: string | null
  createdAt: number
  updatedAt: number
}
```

- [ ] **Step 2: Add `conversationId` to the request types**

In `src/shared/types.ts`, add an optional `conversationId` to both request interfaces. In `GenerateImageRequest` (after `prompt: string`):

```ts
  /** Append the turn to this conversation; a new one is created if omitted. */
  conversationId?: string
```

Add the identical field to `GenerateVideoRequest` (after its `prompt: string`).

- [ ] **Step 3: Add the Conversation types**

In `src/shared/types.ts`, immediately after the Templates section (after the `TemplateUpdate` interface, around line 87), add:

```ts
// ---- Conversations ------------------------------------------------------
// A conversation groups one or more generations (turns), newest by createdAt.
export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

/** Inputs for creating a conversation; main assigns id/timestamps. */
export interface ConversationCreate {
  /** Defaults to "New chat" when omitted. */
  title?: string
}

/** Partial update; main bumps updatedAt. */
export interface ConversationUpdate {
  title?: string
}
```

- [ ] **Step 4: Add the conversation IPC channels**

In the `IPC` object, add after the `generationsChanged` line:

```ts
  // conversations
  conversationsGetAll: 'conversations:get-all',
  conversationsCreate: 'conversations:create',
  conversationsRename: 'conversations:rename',
  conversationsDelete: 'conversations:delete',
  conversationsChanged: 'conversations:changed',
```

- [ ] **Step 5: Verify typecheck fails where expected**

Run: `pnpm typecheck`
Expected: errors in `src/main/db.ts`, `src/main/ipc.ts` (Generation now requires `conversationId`/`attachments`). These are fixed in Tasks 4-7. Confirm the errors are only about the new required fields / missing channels, not typos.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): conversation + attachment types and IPC channels"
```

---

## Task 4: Schema + Drizzle migration

**Files:**
- Modify: `src/main/schema.ts`
- Generated: `drizzle/0002_*.sql`

- [ ] **Step 1: Add the conversations table**

In `src/main/schema.ts`, update the type import to include `Attachment`:

```ts
import type {
  GenerationType,
  GenerationStatus,
  GenerationAsset,
  Attachment,
  TemplateKind,
  TemplateConfig
} from '../shared/types'
```

Then add, **above** the `generations` table definition:

```ts
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => [index('idx_conversations_created_at').on(desc(table.createdAt))]
)
```

- [ ] **Step 2: Add the new columns to generations**

In the `generations` table definition, add these two columns (after `id`):

```ts
    conversationId: text('conversation_id').references(() => conversations.id),
```

and after `assets`:

```ts
    attachments: text('attachments', { mode: 'json' })
      .$type<Attachment[]>()
      .notNull()
      .default([]),
```

`conversationId` is intentionally nullable in the DB; the app always sets it, and the Task 5 backfill fills legacy rows.

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/0002_*.sql` creating `conversations`, adding `conversation_id` and `attachments` to `generations`, plus an updated snapshot under `drizzle/meta/`.

- [ ] **Step 4: Inspect the generated SQL**

Run: `git status --short drizzle/`
Expected: a new `0002_*.sql` and changed `meta/_journal.json` + `0002_snapshot.json`. Open the `.sql` and confirm it contains `CREATE TABLE \`conversations\``, `ALTER TABLE \`generations\` ADD \`conversation_id\``, and `ALTER TABLE \`generations\` ADD \`attachments\` ... DEFAULT '[]'`. No manual edits needed (backfill is code, Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/main/schema.ts drizzle/
git commit -m "feat(schema): conversations table + generation conversationId/attachments"
```

---

## Task 5: Idempotent backfill

**Files:**
- Create: `src/main/backfill.ts`
- Test: `src/main/backfill.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/backfill.test.ts`:

```ts
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
  const gens = sqlite
    .prepare('SELECT id, conversation_id FROM generations ORDER BY id')
    .all()
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/main/backfill.test.ts`
Expected: FAIL (`./backfill` has no `backfillConversations`).

- [ ] **Step 3: Implement the backfill**

Create `src/main/backfill.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/main/backfill.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/backfill.ts src/main/backfill.test.ts
git commit -m "feat(db): idempotent legacy-generation conversation backfill"
```

---

## Task 6: db.ts — openDatabase, conversation CRUD, backfill wiring

**Files:**
- Modify: `src/main/db.ts`
- Test: `src/main/db.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/db.test.ts`:

```ts
import { resolve } from 'path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { Conversation, Generation } from '@shared/types'
import * as db from './db'

beforeEach(() => {
  db.openDatabase(':memory:', resolve(process.cwd(), 'drizzle'))
})

afterEach(() => db.closeDatabase())

function makeGeneration(id: string, conversationId: string): Generation {
  return {
    id,
    conversationId,
    type: 'image',
    prompt: 'p',
    model: 'm',
    status: 'completed',
    params: {},
    assets: [],
    attachments: [],
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

test('create, list and rename a conversation', () => {
  const conv: Conversation = {
    id: 'c1',
    title: 'First',
    createdAt: 1,
    updatedAt: 1
  }
  db.insertConversation(conv)
  expect(db.getAllConversations().map((c) => c.id)).toEqual(['c1'])

  const renamed = db.updateConversation('c1', { title: 'Renamed' })
  expect(renamed?.title).toBe('Renamed')
})

test('getGenerationsByConversation filters by parent', () => {
  db.insertConversation({ id: 'c1', title: 'c', createdAt: 1, updatedAt: 1 })
  db.insertGeneration(makeGeneration('g1', 'c1'))
  db.insertGeneration(makeGeneration('g2', 'c1'))
  expect(db.getGenerationsByConversation('c1').map((g) => g.id).sort()).toEqual(['g1', 'g2'])
})

test('deleteConversation cascades to its generations and returns their ids', () => {
  db.insertConversation({ id: 'c1', title: 'c', createdAt: 1, updatedAt: 1 })
  db.insertGeneration(makeGeneration('g1', 'c1'))
  db.insertGeneration(makeGeneration('g2', 'c1'))

  const deletedIds = db.deleteConversation('c1').sort()
  expect(deletedIds).toEqual(['g1', 'g2'])
  expect(db.getAllConversations()).toEqual([])
  expect(db.getGenerationsByConversation('c1')).toEqual([])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/main/db.test.ts`
Expected: FAIL (`openDatabase`/`closeDatabase`/conversation functions not exported).

- [ ] **Step 3: Refactor connection setup and add conversation queries**

In `src/main/db.ts`, replace the imports and the `db` declaration + `initDb` (lines 1-27) with:

```ts
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
```

- [ ] **Step 4: Add conversation CRUD + by-conversation query**

In `src/main/db.ts`, add after the `deleteGeneration` function:

```ts
export function getGenerationsByConversation(conversationId: string): Generation[] {
  return db
    .select()
    .from(generations)
    .where(eq(generations.conversationId, conversationId))
    .orderBy(desc(generations.createdAt))
    .all()
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/main/db.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify the whole suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all tests pass. `typecheck` still reports errors in `src/main/ipc.ts` only (Generation now needs `conversationId`/`attachments` when constructed, and new channels are unhandled) — fixed in Task 7.

- [ ] **Step 7: Commit**

```bash
git add src/main/db.ts src/main/db.test.ts
git commit -m "feat(db): openDatabase + conversation CRUD and cascade delete"
```

---

## Task 7: ipc.ts — conversation handlers and generate wiring

**Files:**
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Import the new types and add a broadcast helper**

In `src/main/ipc.ts`, extend the `@shared/types` import to add `Conversation`, `ConversationCreate`, and `randomUUID` is already imported. Add to the destructured type import list: `Conversation`, `ConversationCreate`.

Add after `broadcastGenerationsChanged`:

```ts
function broadcastConversationsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.conversationsChanged)
  }
}

/** Create a conversation row, broadcast, and return it. */
function createConversation(input: ConversationCreate = {}): Conversation {
  const now = Date.now()
  const conv: Conversation = {
    id: randomUUID(),
    title: input.title?.trim() || 'New chat',
    createdAt: now,
    updatedAt: now
  }
  db.insertConversation(conv)
  broadcastConversationsChanged()
  return conv
}

/** Resolve the conversation a new turn belongs to, creating one if needed. */
function resolveConversationId(prompt: string, conversationId?: string): string {
  if (conversationId && db.getConversation(conversationId)) return conversationId
  return createConversation({ title: prompt.slice(0, 80) }).id
}
```

- [ ] **Step 2: Set conversationId + attachments when constructing generations**

In `startImageGeneration`, after `const prompt = req.prompt?.trim()` guard and before `const now = Date.now()`, add:

```ts
  const conversationId = resolveConversationId(prompt, req.conversationId)
```

In the `gen` object literal, add `conversationId,` after `id: randomUUID(),` and `attachments: [],` after `assets: [],`. Change the return to:

```ts
  return { id: gen.id, conversationId }
```

- [ ] **Step 3: Mirror the change in startVideoGeneration**

Apply the identical changes in `startVideoGeneration`: add `const conversationId = resolveConversationId(prompt, req.conversationId)` before `const now = Date.now()`, add `conversationId,` and `attachments: [],` to the `gen` literal, and return `{ id: gen.id, conversationId }`.

- [ ] **Step 4: Register conversation IPC handlers and cascade media on delete**

Leave the existing `IPC.generationsDelete` handler unchanged. In `registerIpcHandlers`, add a new conversations block immediately after the `// generations` block:

```ts
  // conversations
  ipcMain.handle(IPC.conversationsGetAll, () => db.getAllConversations())
  ipcMain.handle(IPC.conversationsCreate, (_e, input: ConversationCreate) =>
    createConversation(input)
  )
  ipcMain.handle(IPC.conversationsRename, (_e, id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) throw new Error('Conversation title is required.')
    const conv = db.updateConversation(id, { title: trimmed })
    if (!conv) throw new Error('Conversation not found.')
    broadcastConversationsChanged()
    return conv
  })
  ipcMain.handle(IPC.conversationsDelete, (_e, id: string) => {
    const generationIds = db.deleteConversation(id)
    for (const gid of generationIds) storage.deleteGenerationMedia(gid)
    broadcastConversationsChanged()
    broadcastGenerationsChanged()
  })
```

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat(ipc): conversation handlers and conversationId wiring"
```

---

## Task 8: storage.ts — input-file helper

**Files:**
- Modify: `src/main/storage.ts`

- [ ] **Step 1: Add the helper**

In `src/main/storage.ts`, update the type import to include `Attachment`:

```ts
import type { GenerationAsset, Attachment } from '@shared/types'
```

Add after `saveAsset`:

```ts
/** Persist one reference-file input under the generation's input/ folder. */
export function saveInputAsset(
  generationId: string,
  index: number,
  bytes: Buffer,
  contentType: string
): Attachment {
  const dir = join(generationDir(generationId), 'input')
  mkdirSync(dir, { recursive: true })
  const fileName = `${index}.${extFor(contentType)}`
  writeFileSync(join(dir, fileName), bytes)
  return {
    fileName,
    url: `${MEDIA_SCHEME}://asset/${generationId}/input/${fileName}`,
    contentType
  }
}
```

The existing `media://` protocol handler already serves any path under `media/<id>/`, so `input/` files resolve without changes.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors. (`saveInputAsset` is unused for now; it is exported, so no unused-var error.)

- [ ] **Step 3: Commit**

```bash
git add src/main/storage.ts
git commit -m "feat(storage): saveInputAsset for reference-file inputs"
```

---

## Task 9: preload + api surface

**Files:**
- Modify: `src/shared/api.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Extend the API contract**

In `src/shared/api.ts`, add `Conversation`, `ConversationCreate` to the type import. Change the generate return types and add a `conversations` block:

```ts
  generateImage(req: GenerateImageRequest): Promise<{ id: string; conversationId: string }>
  generateVideo(req: GenerateVideoRequest): Promise<{ id: string; conversationId: string }>
```

Add after the `generations` block:

```ts
  conversations: {
    getAll(): Promise<Conversation[]>
    create(input?: ConversationCreate): Promise<Conversation>
    rename(id: string, title: string): Promise<Conversation>
    delete(id: string): Promise<void>
    /** Subscribe to store changes. Returns an unsubscribe function. */
    onChanged(callback: () => void): () => void
  }
```

- [ ] **Step 2: Implement the preload bridge**

In `src/preload/index.ts`, add after the `generations` block:

```ts
  conversations: {
    getAll: () => ipcRenderer.invoke(IPC.conversationsGetAll),
    create: (input) => ipcRenderer.invoke(IPC.conversationsCreate, input ?? {}),
    rename: (id, title) => ipcRenderer.invoke(IPC.conversationsRename, id, title),
    delete: (id) => ipcRenderer.invoke(IPC.conversationsDelete, id),
    onChanged: (callback) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC.conversationsChanged, listener)
      return () => ipcRenderer.removeListener(IPC.conversationsChanged, listener)
    }
  },
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared/api.ts src/preload/index.ts
git commit -m "feat(api): conversations bridge surface"
```

---

## Task 10: renderer conversations collection

**Files:**
- Create: `src/renderer/src/lib/conversations.ts`

- [ ] **Step 1: Create the synced collection**

Create `src/renderer/src/lib/conversations.ts`:

```ts
import type { Conversation } from '@shared/types'
import { createSyncedCollection } from './syncedCollection'

// Reactive mirror of the main-process conversations store. Mutations go
// through `window.api`, not through collection mutation handlers.
export const conversationsCollection = createSyncedCollection<Conversation>({
  id: 'conversations',
  getKey: (conv) => conv.id,
  getAll: () => window.api.conversations.getAll(),
  onChanged: (cb) => window.api.conversations.onChanged(cb),
  getUpdatedAt: (conv) => conv.updatedAt
})
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors. (The collection is unused until Spec B; exporting it avoids unused warnings.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/lib/conversations.ts
git commit -m "feat(renderer): conversations synced collection"
```

---

## Final verification

- [ ] **Step 1: Run the full suite, typecheck, and lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all tests pass; no type errors; no lint errors.

- [ ] **Step 2: Smoke-test the running app**

Run: `pnpm dev`
Expected: the app launches against your existing database; the startup migration adds the new columns/table and the backfill wraps existing generations into conversations. The current UI still lists and opens past generations and can generate a new image/video (now created inside an auto-made conversation). No console errors about missing columns or IPC channels.

---

## Notes for the implementer

- This spec changes no visible UI. `PromptBar` still calls `generateImage`/`generateVideo`; the added `{ conversationId }` in the response is simply ignored until Spec B.
- The `media://` protocol already serves nested paths, so `input/` attachment files need no protocol changes.
- `conversationId` is nullable in SQLite by design; the app always sets it and the backfill fills legacy rows. Do not add a `NOT NULL` constraint (SQLite cannot add one to a populated table without a table rebuild).
