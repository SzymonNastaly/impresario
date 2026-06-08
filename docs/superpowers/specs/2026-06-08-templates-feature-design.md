# Templates Feature — Design

**Date:** 2026-06-08
**Status:** Approved (design)

## Summary

Add **templates** to Impresario Studio: a reusable, named prompt + model
configuration stored in the database, selectable when starting a new
generation. Includes an editor to create/edit/delete templates, plus
export to / import from `.json` files.

The design deliberately leaves room to grow the concept later (multi-step
templates, reference files) without schema migrations, by discriminating on
a `kind` field and storing the evolving payload in a versioned JSON `config`
blob.

## Goals

- Persist templates in SQLite (source of truth in the main process).
- Editor UI to create, edit, and delete templates.
- Select a template when starting a new generation; it pre-fills the prompt
  bar and is fully editable before generating.
- Export a single template to a `.json` file; import a template from a file.
- Architecture that accommodates future template kinds (multi-step,
  reference files) with minimal churn.

## Non-Goals (v1)

- Prompt variables / placeholders (`{{subject}}`). Plain text only for now;
  the data model leaves room to add them later.
- Multi-step templates and reference files (future kinds).
- Live PromptBar controls for `numberOfImages` / `size`. A template can set
  these and they flow into the generate request, but exposing them as live
  controls in the PromptBar is a follow-up.
- Recording which template a generation came from (`templateId` link).
- A test framework (none is configured in the project today).

## Architecture

Follows the existing app pattern end-to-end:

```
schema.ts (drizzle) → db.ts (data layer) → ipc.ts (handlers)
  → shared/types.ts (IPC registry + types) → preload (bridge)
  → shared/api.ts (contract) → renderer collection (reactive mirror) → UI
```

### Key decision: `kind` + versioned JSON `config`

The `templates` table keeps thin relational columns and stores the
kind-specific payload in a JSON-mode `config` column — the same approach
`generations.params` / `generations.assets` already use. A new future
capability adds a new `kind` value and a new `config` variant; no schema
migration is required.

## Data Model (`src/shared/types.ts`)

```ts
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

// Inputs for create/update (no id/timestamps; main assigns them).
export interface TemplateCreate {
  name: string
  kind: TemplateKind
  config: TemplateConfig
}
export interface TemplateUpdate {
  name?: string
  config?: TemplateConfig
}
```

## Database

### Schema (`src/main/schema.ts`)

New `templates` table mirroring the `generations` table:

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

Migration generated with `pnpm db:generate`; applied at startup by the
existing `migrate(...)` call in `db.ts`.

### Data layer (`src/main/db.ts`)

Functions parallel to the existing generation functions:

- `getAllTemplates(): Template[]` — ordered by `createdAt desc`
- `getTemplate(id): Template | undefined`
- `insertTemplate(t: Template): Template`
- `updateTemplate(id, patch: TemplateUpdate): Template | undefined` — bumps
  `updatedAt`
- `deleteTemplate(id): void`

Register `templates` in the drizzle schema object passed to `drizzle(...)`.

## File Format (export / import)

Versioned, self-describing, one template per file:

```ts
export interface TemplateFile {
  schemaVersion: 1
  kind: TemplateKind
  name: string
  config: TemplateConfig
}
```

Pure helper functions (no Electron/fs/db deps, so unit-testable later):

- `serializeTemplate(t: Template): TemplateFile` — strips `id` / timestamps.
- `parseTemplateFile(raw: unknown): TemplateCreate` — validates
  `schemaVersion === 1`, `kind` is known, and the `config` shape for that
  kind (e.g. `single-prompt` requires non-empty `prompt` and `model`
  strings). Throws a descriptive `Error` on invalid input.

Import always creates a **fresh** `id` and timestamps — importing never
overwrites an existing template.

These helpers live in a new shared module, e.g.
`src/shared/templates.ts` (dependency-free, importable from main and
renderer).

## IPC

### Channel registry (`src/shared/types.ts` `IPC`)

Add:

```
templatesGetAll:  'templates:get-all'
templatesCreate:  'templates:create'
templatesUpdate:  'templates:update'
templatesDelete:  'templates:delete'
templatesExport:  'templates:export'
templatesImport:  'templates:import'
templatesChanged: 'templates:changed'   // main → renderer broadcast
```

### Handlers (`src/main/ipc.ts`)

- `templatesGetAll` → `db.getAllTemplates()`
- `templatesCreate(input: TemplateCreate)` → validate, assign id/timestamps,
  insert, broadcast `templatesChanged`, return the `Template`.
- `templatesUpdate(id, patch: TemplateUpdate)` → update, broadcast, return.
- `templatesDelete(id)` → delete, broadcast.
- `templatesExport(id)` → load template, `serializeTemplate`, show
  `dialog.showSaveDialog` (default filename from template name, `.json`
  filter), write file. Returns `{ canceled: boolean; path?: string }`.
- `templatesImport()` → `dialog.showOpenDialog` (`.json` filter), read file,
  `parseTemplateFile`, insert as new template, broadcast. Returns the
  created `Template`, or `null` if the dialog was canceled. Throws on an
  invalid file (renderer surfaces the message).

A `broadcastTemplatesChanged()` helper mirrors the existing
`broadcastChanged()`.

### Bridge (`src/preload/index.ts`) + contract (`src/shared/api.ts`)

Add a `templates` namespace to `ImpresarioApi`:

```ts
templates: {
  getAll(): Promise<Template[]>
  create(input: TemplateCreate): Promise<Template>
  update(id: string, patch: TemplateUpdate): Promise<Template>
  delete(id: string): Promise<void>
  export(id: string): Promise<{ canceled: boolean; path?: string }>
  import(): Promise<Template | null>  // null when the dialog is canceled
  onChanged(callback: () => void): () => void
}
```

## Renderer State

### Shared collection factory (refactor)

`generationsCollection` and the new `templatesCollection` have identical
"reactive mirror" sync bodies. Extract a small factory to remove the
duplication and refactor the existing collection onto it:

```ts
// src/renderer/src/lib/syncedCollection.ts
createSyncedCollection<T>({
  id, getKey,
  getAll: () => Promise<T[]>,
  onChanged: (cb) => () => void,
  getUpdatedAt: (item: T) => number
})
```

It encapsulates the snapshot-diff, coalesced-refresh, subscribe-before-fetch
logic currently in `lib/generations.ts`. Then:

- `lib/generations.ts` → uses the factory.
- `lib/templates.ts` → `templatesCollection` via the factory.

This is a focused cleanup of code the feature touches, not unrelated
refactoring.

## UI

### Template picker in `PromptBar`

A "Templates" dropdown placed next to the model `Select`. It lists saved
templates; choosing one pre-fills the prompt bar:

- `prompt` → the textarea (editable)
- `model` → the model select (editable)
- `config.params` (`numberOfImages`, `size`) → carried into the
  `GenerateImageRequest` on submit.

A trailing "Manage templates…" item opens the editor modal. If there are no
templates, the dropdown shows an empty state pointing to "Manage templates…".

### `TemplateEditorModal`

Styled like the existing `SettingsModal` (Radix dialog). Contents:

- **List** of saved templates with **Edit**, **Delete**, and **Export**
  (per template) actions.
- **Import** button (top-level) — calls `window.api.templates.import()`,
  shows the resulting error message inline on failure.
- **New / Edit form** fields: `name`, `prompt` (Textarea), `model`
  (Select using `DEFAULT_IMAGE_MODELS`), `numberOfImages`, `size`.
- Create via `templates.create`, edit via `templates.update`.

App wiring: `App.tsx` owns the modal open state (like `settingsOpen`) and
reads the live `templatesCollection`; `PromptBar` receives the templates
list and an `onManageTemplates` callback, plus the existing
`onGenerate`.

## Data Flow

**Create:** Editor form → `window.api.templates.create` → main validates +
inserts → broadcast → `templatesCollection` re-syncs → UI updates.

**Apply:** Pick template in PromptBar → local state pre-filled → user edits →
Generate → `onGenerate(req)` with prompt/model/params → existing generation
flow (unchanged).

**Export:** Editor → `templates.export(id)` → main save dialog + write file.

**Import:** Editor → `templates.import()` → main open dialog + validate +
insert (fresh id) → broadcast → UI updates.

## Error Handling

- `create` / `import` validate via `parseTemplateFile` / inline checks;
  invalid input throws an `Error` whose message is shown in the editor.
- Export/import dialogs returning "canceled" are a no-op (no error).
- Unknown `kind` or `schemaVersion` on import → descriptive error
  ("Unsupported template file version").

## Testing

The project has no test runner configured. Verification for v1:

- `pnpm typecheck` (node + web) passes.
- `pnpm lint` passes.
- Manual: create → appears in picker; apply → pre-fills + generates;
  edit/delete reflect immediately; export writes a file; import round-trips;
  importing a malformed file shows an error.

The `serializeTemplate` / `parseTemplateFile` helpers are pure and isolated
so a unit test runner can cover them later without refactoring.

## Future Extensibility (informing the design)

- **New kinds** (`'multi-step'`): add a `TemplateKind` value, a
  `TemplateConfig` union variant, a `parseTemplateFile` branch, and a
  dedicated editor. No DB migration.
- **Reference files**: a future `config` variant can reference files;
  storage can reuse the existing on-disk media pattern under `userData`.
- **File format**: `schemaVersion` allows evolving `TemplateFile` with a
  migration path on import.
- **Generation provenance**: a `templateId` column can be added later if we
  want to record which template produced a generation.
```
