# Templates Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable, named prompt + model templates to Impresario Studio — stored in SQLite, editable in-app, selectable to pre-fill a new generation, and exportable/importable as versioned `.json` files.

**Architecture:** Follow the existing end-to-end pattern (`schema → db → ipc → shared/types + api → preload → renderer collection → UI`). Templates use a thin relational table plus a JSON-mode `config` column discriminated by `kind`, so future kinds (multi-step, reference files) need no migration. Export/import run in the main process via Electron dialogs + fs, with pure serialize/parse helpers in `src/shared`.

**Tech Stack:** Electron, React 19, TypeScript, Drizzle ORM + better-sqlite3, TanStack DB (reactive mirror), Radix UI / shadcn components, Tailwind.

> **Testing note:** This project has **no test runner configured** (verified: no `test` script in `package.json`), and the spec's non-goals say not to add one. So "verify" steps use `pnpm typecheck` (node + web), `pnpm lint`, and explicit manual runtime checks instead of unit tests. The pure helpers (`serializeTemplate` / `parseTemplateFile`) are written in isolation so a runner can cover them later. Commit after each task.

---

## File Structure

**Create:**
- `src/shared/templates.ts` — pure file-format helpers (`TemplateFile`, `serializeTemplate`, `parseTemplateFile`). Dependency-free.
- `src/renderer/src/lib/syncedCollection.ts` — generic IPC "reactive mirror" collection factory.
- `src/renderer/src/lib/templates.ts` — `templatesCollection`.
- `src/renderer/src/components/TemplateEditorModal.tsx` — list + create/edit/delete/export/import UI.
- `drizzle/<generated>.sql` — migration emitted by `pnpm db:generate`.

**Modify:**
- `src/shared/types.ts` — template types + `IPC` channel registry.
- `src/main/schema.ts` — `templates` table.
- `src/main/db.ts` — register table + data-layer functions.
- `src/main/ipc.ts` — handlers + broadcast + export/import.
- `src/shared/api.ts` — `templates` namespace on `ImpresarioApi`.
- `src/preload/index.ts` — bridge the `templates` namespace.
- `src/renderer/src/lib/generations.ts` — refactor onto the new factory.
- `src/renderer/src/components/PromptBar.tsx` — template picker.
- `src/renderer/src/App.tsx` — wire collection, modal, and PromptBar props.

---

## Task 1: Shared types + IPC channels

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add template types**

Append after the `Generation` interface (before the `GenerateImageRequest` block is fine too; keep it grouped logically):

```ts
// ---- Templates ----------------------------------------------------------
// A template is a reusable prompt + model preset. `kind` discriminates the
// payload stored in `config` (a JSON column), leaving room to add future
// kinds (e.g. multi-step) without a schema migration.
export type TemplateKind = 'single-prompt' // future: | 'multi-step'

export interface SinglePromptConfig {
  prompt: string
  model: string
  params: {
    numberOfImages?: number
    size?: string
  }
}

// Discriminated by Template.kind. Becomes a union as kinds are added.
export type TemplateConfig = SinglePromptConfig

export interface Template {
  id: string
  name: string
  kind: TemplateKind
  config: TemplateConfig
  createdAt: number
  updatedAt: number
}

/** Inputs for creating a template; main assigns id/timestamps. */
export interface TemplateCreate {
  name: string
  kind: TemplateKind
  config: TemplateConfig
}

/** Partial update; main bumps updatedAt. */
export interface TemplateUpdate {
  name?: string
  config?: TemplateConfig
}
```

- [ ] **Step 2: Add IPC channels**

In the `IPC` object, add a templates block before the closing `}`:

```ts
  // templates
  templatesGetAll: 'templates:get-all',
  templatesCreate: 'templates:create',
  templatesUpdate: 'templates:update',
  templatesDelete: 'templates:delete',
  templatesExport: 'templates:export',
  templatesImport: 'templates:import',
  templatesChanged: 'templates:changed',
```

(Add a comma after the previous entry `generationsChanged: 'generations:changed'` so the object stays valid.)

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS (no usages yet; types compile).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(templates): add shared types and IPC channels"
```

---

## Task 2: Pure file-format helpers

**Files:**
- Create: `src/shared/templates.ts`

- [ ] **Step 1: Write the helper module**

```ts
// Pure, dependency-free helpers for the template file format. No Electron,
// fs, or db imports here so they can run in any process (and be unit-tested
// later). The on-disk format is a self-describing, versioned envelope.
import type { Template, TemplateCreate, TemplateConfig, TemplateKind } from './types'

export interface TemplateFile {
  schemaVersion: 1
  kind: TemplateKind
  name: string
  config: TemplateConfig
}

const KNOWN_KINDS: readonly TemplateKind[] = ['single-prompt']

/** Strip id/timestamps; produce the on-disk representation. */
export function serializeTemplate(t: Template): TemplateFile {
  return { schemaVersion: 1, kind: t.kind, name: t.name, config: t.config }
}

/**
 * Validate untrusted JSON into a TemplateCreate. Throws a descriptive Error
 * on anything malformed. Never returns an id — import always creates fresh.
 */
export function parseTemplateFile(raw: unknown): TemplateCreate {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid template file: expected a JSON object.')
  }
  const obj = raw as Record<string, unknown>
  if (obj.schemaVersion !== 1) {
    throw new Error('Unsupported template file version.')
  }
  const kind = obj.kind
  if (typeof kind !== 'string' || !KNOWN_KINDS.includes(kind as TemplateKind)) {
    throw new Error(`Unsupported template kind: ${String(kind)}.`)
  }
  const name =
    typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Imported template'
  // Only 'single-prompt' exists today, so config parsing isn't yet keyed on
  // kind. When a second kind is added, branch here on `kind`.
  const config = parseConfig(obj.config)
  return { name, kind: kind as TemplateKind, config }
}

function parseConfig(raw: unknown): TemplateConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid template file: missing config.')
  }
  const c = raw as Record<string, unknown>
  if (typeof c.prompt !== 'string' || !c.prompt.trim()) {
    throw new Error('Invalid template file: prompt is required.')
  }
  if (typeof c.model !== 'string' || !c.model.trim()) {
    throw new Error('Invalid template file: model is required.')
  }
  const rawParams =
    typeof c.params === 'object' && c.params !== null ? (c.params as Record<string, unknown>) : {}
  return {
    prompt: c.prompt,
    model: c.model,
    params: {
      ...(typeof rawParams.numberOfImages === 'number'
        ? { numberOfImages: rawParams.numberOfImages }
        : {}),
      ...(typeof rawParams.size === 'string' ? { size: rawParams.size } : {})
    }
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/templates.ts
git commit -m "feat(templates): add pure file-format serialize/parse helpers"
```

---

## Task 3: Database schema + migration

**Files:**
- Modify: `src/main/schema.ts`
- Create: `drizzle/<generated>.sql` (via `pnpm db:generate`)

- [ ] **Step 1: Import the new types**

Change the type import line to add `TemplateKind` and `TemplateConfig`:

```ts
import type {
  GenerationType,
  GenerationStatus,
  GenerationAsset,
  TemplateKind,
  TemplateConfig
} from '../shared/types'
```

- [ ] **Step 2: Add the templates table**

Append to `src/main/schema.ts`:

```ts
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
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/000X_*.sql` file is emitted containing `CREATE TABLE \`templates\`` and the `idx_templates_created_at` index. No prompts (additive change).

- [ ] **Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/schema.ts drizzle/
git commit -m "feat(templates): add templates table and migration"
```

---

## Task 4: Database data layer

**Files:**
- Modify: `src/main/db.ts`

- [ ] **Step 1: Import the table and types**

Update the imports:

```ts
import type { Generation, Template, TemplateUpdate } from '@shared/types'
import { generations, templates } from './schema'
```

And widen the `db` type:

```ts
let db: BetterSQLite3Database<{
  generations: typeof generations
  templates: typeof templates
}>
```

- [ ] **Step 2: Register the table in drizzle**

In `initDb()`, change the drizzle call:

```ts
  db = drizzle(sqlite, { schema: { generations, templates } })
```

- [ ] **Step 3: Add template data-layer functions**

Append to `src/main/db.ts`:

```ts
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
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/db.ts
git commit -m "feat(templates): add template data-layer functions"
```

---

## Task 5: Main-process IPC handlers

**Files:**
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Add imports**

At the top of `src/main/ipc.ts`, extend the imports:

```ts
import { readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { ipcMain, BrowserWindow, dialog } from 'electron'
import {
  IPC,
  DEFAULT_IMAGE_MODEL,
  type Generation,
  type GenerateImageRequest,
  type Template,
  type TemplateCreate,
  type TemplateUpdate
} from '@shared/types'
import { serializeTemplate, parseTemplateFile } from '@shared/templates'
```

(Keep the existing `db`, `keychain`, `storage`, `generateImages` imports.)

- [ ] **Step 2: Add a templates-changed broadcaster**

Below the existing `broadcastChanged()`:

```ts
function broadcastTemplatesChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.templatesChanged)
  }
}
```

- [ ] **Step 3: Add create / export / import helpers**

Above `registerIpcHandlers()`:

```ts
function createTemplate(input: TemplateCreate): Template {
  const name = input.name?.trim()
  if (!name) throw new Error('Template name is required.')
  const now = Date.now()
  const tpl: Template = {
    id: randomUUID(),
    name,
    kind: input.kind,
    config: input.config,
    createdAt: now,
    updatedAt: now
  }
  db.insertTemplate(tpl)
  broadcastTemplatesChanged()
  return tpl
}

async function exportTemplate(id: string): Promise<{ canceled: boolean; path?: string }> {
  const tpl = db.getTemplate(id)
  if (!tpl) throw new Error('Template not found.')
  const safeName = tpl.name.replace(/[^\w.-]+/g, '_') || 'template'
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export template',
    defaultPath: `${safeName}.json`,
    filters: [{ name: 'Template', extensions: ['json'] }]
  })
  if (canceled || !filePath) return { canceled: true }
  writeFileSync(filePath, JSON.stringify(serializeTemplate(tpl), null, 2))
  return { canceled: false, path: filePath }
}

async function importTemplate(): Promise<Template | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import template',
    properties: ['openFile'],
    filters: [{ name: 'Template', extensions: ['json'] }]
  })
  if (canceled || filePaths.length === 0) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(filePaths[0], 'utf-8'))
  } catch {
    throw new Error('Invalid template file: not valid JSON.')
  }
  return createTemplate(parseTemplateFile(parsed))
}
```

- [ ] **Step 4: Register the handlers**

Inside `registerIpcHandlers()`, after the generations handlers, add:

```ts
  // templates
  ipcMain.handle(IPC.templatesGetAll, () => db.getAllTemplates())
  ipcMain.handle(IPC.templatesCreate, (_e, input: TemplateCreate) => createTemplate(input))
  ipcMain.handle(IPC.templatesUpdate, (_e, id: string, patch: TemplateUpdate) => {
    const tpl = db.updateTemplate(id, patch)
    if (!tpl) throw new Error('Template not found.')
    broadcastTemplatesChanged()
    return tpl
  })
  ipcMain.handle(IPC.templatesDelete, (_e, id: string) => {
    db.deleteTemplate(id)
    broadcastTemplatesChanged()
  })
  ipcMain.handle(IPC.templatesExport, (_e, id: string) => exportTemplate(id))
  ipcMain.handle(IPC.templatesImport, () => importTemplate())
```

- [ ] **Step 5: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat(templates): add main-process IPC handlers (CRUD + export/import)"
```

---

## Task 6: Preload bridge + API contract

**Files:**
- Modify: `src/shared/api.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Extend the API contract**

In `src/shared/api.ts`, update the import and add a `templates` namespace:

```ts
import type {
  Generation,
  GenerateImageRequest,
  KeyStatus,
  Template,
  TemplateCreate,
  TemplateUpdate
} from './types'
```

Inside the `ImpresarioApi` interface, add:

```ts
  templates: {
    getAll(): Promise<Template[]>
    create(input: TemplateCreate): Promise<Template>
    update(id: string, patch: TemplateUpdate): Promise<Template>
    delete(id: string): Promise<void>
    export(id: string): Promise<{ canceled: boolean; path?: string }>
    /** Returns the created template, or null if the dialog was canceled. */
    import(): Promise<Template | null>
    /** Subscribe to store changes. Returns an unsubscribe function. */
    onChanged(callback: () => void): () => void
  }
```

- [ ] **Step 2: Implement the bridge**

In `src/preload/index.ts`, add a `templates` namespace to the `api` object (after `generations`):

```ts
  templates: {
    getAll: () => ipcRenderer.invoke(IPC.templatesGetAll),
    create: (input) => ipcRenderer.invoke(IPC.templatesCreate, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.templatesUpdate, id, patch),
    delete: (id) => ipcRenderer.invoke(IPC.templatesDelete, id),
    export: (id) => ipcRenderer.invoke(IPC.templatesExport, id),
    import: () => ipcRenderer.invoke(IPC.templatesImport),
    onChanged: (callback) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC.templatesChanged, listener)
      return () => ipcRenderer.removeListener(IPC.templatesChanged, listener)
    }
  },
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS (both node and web projects).

- [ ] **Step 4: Commit**

```bash
git add src/shared/api.ts src/preload/index.ts
git commit -m "feat(templates): expose templates namespace over the preload bridge"
```

---

## Task 7: Renderer reactive-mirror factory + collections

**Files:**
- Create: `src/renderer/src/lib/syncedCollection.ts`
- Modify: `src/renderer/src/lib/generations.ts`
- Create: `src/renderer/src/lib/templates.ts`

- [ ] **Step 1: Write the generic factory**

Create `src/renderer/src/lib/syncedCollection.ts`:

```ts
import { createCollection } from '@tanstack/react-db'

// Generic "reactive mirror" over an IPC-backed store. SQLite in the main
// process is the source of truth; this loads via `getAll` and re-syncs
// whenever the main process broadcasts a change via `onChanged`.
interface SyncedCollectionOptions<T> {
  id: string
  getKey: (item: T) => string
  getAll: () => Promise<T[]>
  onChanged: (cb: () => void) => () => void
  getUpdatedAt: (item: T) => number
}

export function createSyncedCollection<T extends object>(opts: SyncedCollectionOptions<T>) {
  return createCollection<T, string>({
    id: opts.id,
    getKey: opts.getKey,
    sync: {
      sync: ({ begin, write, commit, markReady }) => {
        // Last-known snapshot, used to diff fetched state into sync messages.
        const snapshot = new Map<string, T>()

        const apply = (items: T[]): void => {
          const nextIds = new Set(items.map((i) => opts.getKey(i)))
          begin()
          for (const item of items) {
            const key = opts.getKey(item)
            const prev = snapshot.get(key)
            if (!prev) {
              write({ type: 'insert', value: item })
            } else if (opts.getUpdatedAt(prev) !== opts.getUpdatedAt(item)) {
              write({ type: 'update', value: item })
            }
          }
          for (const [key, prev] of snapshot) {
            if (!nextIds.has(key)) write({ type: 'delete', value: prev })
          }
          commit()
          snapshot.clear()
          for (const item of items) snapshot.set(opts.getKey(item), item)
        }

        // Coalesce overlapping refreshes: only the most recent fetch applies.
        let seq = 0
        const refresh = async (): Promise<void> => {
          const mySeq = ++seq
          const items = await opts.getAll()
          if (mySeq === seq) apply(items)
        }

        // Subscribe before the initial fetch so no change is missed.
        const unsubscribe = opts.onChanged(() => {
          void refresh()
        })

        refresh().finally(() => markReady())

        return () => unsubscribe()
      }
    }
  })
}
```

- [ ] **Step 2: Refactor `generations.ts` onto the factory**

Replace the entire contents of `src/renderer/src/lib/generations.ts` with:

```ts
import type { Generation } from '@shared/types'
import { createSyncedCollection } from './syncedCollection'

// Reactive mirror of the main-process generations store. Mutations go
// through `window.api`, not through collection mutation handlers.
export const generationsCollection = createSyncedCollection<Generation>({
  id: 'generations',
  getKey: (gen) => gen.id,
  getAll: () => window.api.generations.getAll(),
  onChanged: (cb) => window.api.generations.onChanged(cb),
  getUpdatedAt: (gen) => gen.updatedAt
})
```

- [ ] **Step 3: Create `templates.ts`**

Create `src/renderer/src/lib/templates.ts`:

```ts
import type { Template } from '@shared/types'
import { createSyncedCollection } from './syncedCollection'

// Reactive mirror of the main-process templates store.
export const templatesCollection = createSyncedCollection<Template>({
  id: 'templates',
  getKey: (tpl) => tpl.id,
  getAll: () => window.api.templates.getAll(),
  onChanged: (cb) => window.api.templates.onChanged(cb),
  getUpdatedAt: (tpl) => tpl.updatedAt
})
```

- [ ] **Step 4: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. (Lint matters here because `generations.ts` was rewritten.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/syncedCollection.ts src/renderer/src/lib/generations.ts src/renderer/src/lib/templates.ts
git commit -m "refactor(renderer): extract createSyncedCollection; add templates collection"
```

---

## Task 8: Template editor modal

**Files:**
- Create: `src/renderer/src/components/TemplateEditorModal.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react'
import { Download, Pencil, Trash2, Upload } from 'lucide-react'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_MODELS,
  type Template,
  type TemplateCreate
} from '@shared/types'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface TemplateEditorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: Template[]
}

// Form state uses strings for the numeric/optional fields so inputs stay
// controlled; draftToCreate normalizes them on save.
interface Draft {
  id?: string
  name: string
  prompt: string
  model: string
  numberOfImages: string
  size: string
}

function emptyDraft(): Draft {
  return { name: '', prompt: '', model: DEFAULT_IMAGE_MODEL, numberOfImages: '1', size: '' }
}

function draftFromTemplate(t: Template): Draft {
  return {
    id: t.id,
    name: t.name,
    prompt: t.config.prompt,
    model: t.config.model,
    numberOfImages: t.config.params.numberOfImages ? String(t.config.params.numberOfImages) : '',
    size: t.config.params.size ?? ''
  }
}

function draftToCreate(d: Draft): TemplateCreate {
  const count = parseInt(d.numberOfImages, 10)
  return {
    name: d.name.trim(),
    kind: 'single-prompt',
    config: {
      prompt: d.prompt.trim(),
      model: d.model,
      params: {
        ...(Number.isFinite(count) && count > 0 ? { numberOfImages: count } : {}),
        ...(d.size.trim() ? { size: d.size.trim() } : {})
      }
    }
  }
}

export function TemplateEditorModal({
  open,
  onOpenChange,
  templates
}: TemplateEditorModalProps): React.JSX.Element {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSave = draft !== null && draft.name.trim().length > 0 && draft.prompt.trim().length > 0

  function reset(): void {
    setDraft(null)
    setError(null)
  }

  async function save(): Promise<void> {
    if (!draft || !canSave) return
    const input = draftToCreate(draft)
    try {
      if (draft.id) {
        await window.api.templates.update(draft.id, { name: input.name, config: input.config })
      } else {
        await window.api.templates.create(input)
      }
      reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save template.')
    }
  }

  async function remove(id: string): Promise<void> {
    await window.api.templates.delete(id)
    if (draft?.id === id) reset()
  }

  async function exportOne(id: string): Promise<void> {
    try {
      await window.api.templates.export(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export template.')
    }
  }

  async function importOne(): Promise<void> {
    try {
      await window.api.templates.import()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import template.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Templates</DialogTitle>
          <DialogDescription>
            Reusable prompt + model presets for starting new generations.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        {draft ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={draft.name}
                autoFocus
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-prompt">Prompt</Label>
              <Textarea
                id="tpl-prompt"
                rows={3}
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Model</Label>
              <Select value={draft.model} onValueChange={(v) => setDraft({ ...draft, model: v })}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_IMAGE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="tpl-count">Images</Label>
                <Input
                  id="tpl-count"
                  type="number"
                  min={1}
                  value={draft.numberOfImages}
                  onChange={(e) => setDraft({ ...draft, numberOfImages: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tpl-size">Size</Label>
                <Input
                  id="tpl-size"
                  placeholder="1024x1024"
                  value={draft.size}
                  onChange={(e) => setDraft({ ...draft, size: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
              <Button disabled={!canSave} onClick={() => void save()}>
                {draft.id ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="max-h-72 overflow-y-auto rounded-md border border-border">
              {templates.length === 0 ? (
                <div className="px-3.5 py-6 text-sm text-muted-foreground">
                  No templates yet. Create one to get started.
                </div>
              ) : (
                templates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm">{t.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{t.config.prompt}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Export"
                        onClick={() => void exportOne(t.id)}
                      >
                        <Download />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Edit"
                        onClick={() => setDraft(draftFromTemplate(t))}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Delete"
                        onClick={() => void remove(t.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => void importOne()}>
                <Upload /> Import
              </Button>
              <Button size="sm" onClick={() => setDraft(emptyDraft())}>
                New template
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/TemplateEditorModal.tsx
git commit -m "feat(templates): add template editor modal"
```

---

## Task 9: PromptBar picker + App wiring

**Files:**
- Modify: `src/renderer/src/components/PromptBar.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Rewrite PromptBar with a template picker**

Replace the entire contents of `src/renderer/src/components/PromptBar.tsx` with:

```tsx
import { useState } from 'react'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_MODELS,
  type GenerateImageRequest,
  type Template
} from '@shared/types'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from './ui/select'

interface PromptBarProps {
  hasKey: boolean
  templates: Template[]
  onGenerate: (req: GenerateImageRequest) => Promise<void>
  onNeedKey: () => void
  onManageTemplates: () => void
}

// Sentinel value for the "Manage templates…" action in the picker. Real
// template ids are UUIDs, so this can never collide.
const MANAGE_VALUE = '__manage__'

export function PromptBar({
  hasKey,
  templates,
  onGenerate,
  onNeedKey,
  onManageTemplates
}: PromptBarProps): React.JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string>(DEFAULT_IMAGE_MODEL)
  // Extra generation params carried from an applied template (no PromptBar
  // controls for these yet; they ride into the generate request).
  const [params, setParams] = useState<{ numberOfImages?: number; size?: string }>({})

  const canSubmit = prompt.trim().length > 0

  // The picker is a one-shot action menu: its value is always '' so it shows
  // the "Templates" placeholder and never visually "sticks" on a selection.
  function onPickTemplate(value: string): void {
    if (value === MANAGE_VALUE) {
      onManageTemplates()
      return
    }
    const tpl = templates.find((t) => t.id === value)
    if (!tpl) return
    setPrompt(tpl.config.prompt)
    setModel(tpl.config.model)
    setParams(tpl.config.params ?? {})
  }

  async function submit(): Promise<void> {
    if (!hasKey) {
      onNeedKey()
      return
    }
    if (!canSubmit) return
    const text = prompt.trim()
    setPrompt('')
    await onGenerate({ prompt: text, model, ...params })
  }

  return (
    <div className="border-t border-border bg-background px-7 pt-3.5 pb-5">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-input/30 p-2.5 pl-3.5 transition-colors focus-within:border-ring">
        <Textarea
          rows={1}
          placeholder="Describe an image to generate…"
          className="max-h-44 min-h-0 border-0 bg-transparent p-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger size="sm" className="w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_IMAGE_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value="" onValueChange={onPickTemplate}>
              <SelectTrigger size="sm" className="w-auto">
                <SelectValue placeholder="Templates" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
                {templates.length > 0 && <SelectSeparator />}
                <SelectItem value={MANAGE_VALUE}>Manage templates…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
            Generate
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire templates into App.tsx**

In `src/renderer/src/App.tsx`:

(a) Add imports near the top:

```ts
import { templatesCollection } from './lib/templates'
import { TemplateEditorModal } from './components/TemplateEditorModal'
```

(b) Inside `App()`, after the existing generations `useLiveQuery`/`useMemo`, add a templates live query and modal state:

```ts
  const { data: templateData } = useLiveQuery((q) => q.from({ tpl: templatesCollection }))
  const templates = useMemo(
    () => [...(templateData ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [templateData]
  )
  const [templatesOpen, setTemplatesOpen] = useState(false)
```

(c) Pass the new props to `PromptBar`:

```tsx
        <PromptBar
          hasKey={hasKey}
          templates={templates}
          onGenerate={handleGenerate}
          onNeedKey={() => setSettingsOpen(true)}
          onManageTemplates={() => setTemplatesOpen(true)}
        />
```

(d) Render the modal next to `SettingsModal` (before the closing `</div>`):

```tsx
      <TemplateEditorModal
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        templates={templates}
      />
```

- [ ] **Step 3: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/PromptBar.tsx src/renderer/src/App.tsx
git commit -m "feat(templates): add PromptBar picker and wire editor into App"
```

---

## Task 10: Manual end-to-end verification

**Files:** none (runtime verification).

- [ ] **Step 1: Build-level checks**

Run: `pnpm typecheck && pnpm lint`
Expected: both PASS.

- [ ] **Step 2: Launch the app**

Run: `pnpm dev`
Expected: app window opens with no console errors. (The startup migration creates the `templates` table on first run.)

- [ ] **Step 3: Create a template**

In the PromptBar, open the **Templates** dropdown → **Manage templates…** → **New template**. Fill name "Test", prompt "a red fox", model FLUX.1 [dev], Images 2, Size 1024x1024 → **Create**.
Expected: the row appears in the list immediately (reactive update).

- [ ] **Step 4: Apply the template**

Close the modal. Open the **Templates** dropdown → choose "Test".
Expected: the prompt textarea fills with "a red fox" and the model select shows FLUX.1 [dev]. The dropdown still shows the "Templates" placeholder (one-shot).

- [ ] **Step 5: Edit and delete**

Reopen Manage templates → **Edit** "Test", change the name → **Save** (row updates). Then **Delete** it (row disappears).

- [ ] **Step 6: Export round-trip**

Recreate a template, click its **Export** (download icon), save the `.json`. Open the file and confirm it contains `"schemaVersion": 1`, `"kind": "single-prompt"`, and the `config`.

- [ ] **Step 7: Import (happy path + error)**

Click **Import**, select the exported file → a new template appears.
Then edit the saved `.json` to set `"schemaVersion": 2`, save, and Import it again.
Expected: an inline error "Unsupported template file version." and no template created.

- [ ] **Step 8: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore(templates): verification fixes" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Patterns to match:** `src/main/db.ts` (data layer), `src/main/ipc.ts` (handlers + broadcast), `src/renderer/src/components/SettingsModal.tsx` (modal), `src/renderer/src/components/ui/select.tsx` (Radix Select usage), and the `size="icon-xs"` ghost buttons in `Sidebar.tsx`.
- **`GenerateImageRequest`** already has optional `numberOfImages` and `size`, so applying a template's params requires no change to that type or the generation flow.
- **Migrations** are applied at startup by the existing `migrate(...)` call in `db.ts`; you only need to run `pnpm db:generate` after editing the schema.
- **Do not** add a test framework. Verification is typecheck + lint + the manual checklist above.
```
