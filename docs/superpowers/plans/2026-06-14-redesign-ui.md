# Redesign UI (Spec B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chat-style layout with a two-column workspace (model + reference files on the left; template, text box, and a multi-turn output feed on the right) plus an overlay conversation sidebar, reusing the Spec A data foundation.

**Architecture:** Pure, presentation-free logic (model filtering, template-row formatting, conversation-turn grouping) lives in small `src/renderer/src/lib/*.ts` modules that are unit-tested in the existing node-only Vitest harness. The React components consume those helpers and are verified by `pnpm typecheck` plus a final manual run. Reference files are captured in the renderer as `File`s, converted to `ArrayBuffer`s, sent with the generate request, and persisted by the main process via the Spec A `saveInputAsset` helper (never sent to fal).

**Tech Stack:** Electron + React 19 + TanStack DB synced collections, Tailwind + shadcn-style UI primitives, Vitest (node environment), pnpm.

---

## Spec reference

`docs/superpowers/specs/2026-06-14-redesign-ui-design.md` (Spec B). Builds on Spec A
(`2026-06-14-redesign-data-foundation.md`), which is fully implemented.

## Testing constraint (read first)

Vitest runs in `environment: 'node'` with `include: ['src/**/*.test.ts']` (see
`vitest.config.ts`). There is **no jsdom / React Testing Library / `.tsx` test setup**, and
adding one is out of scope for this redesign. Therefore:

- **Pure logic** → real TDD in `src/renderer/src/lib/*.test.ts` (import local modules
  relatively and shared code via `@shared`; the `@renderer` alias is NOT available in tests).
- **React components and Electron IPC wiring** → verified with `pnpm typecheck` and the manual
  walkthrough in Final Verification. This mirrors how Spec A handled its UI/IPC layers.

Run a single test file with: `pnpm test <path>`. Run all tests with `pnpm test`. Typecheck both
projects with `pnpm typecheck`.

## File map

**New pure-logic modules (unit-tested):**
- Create `src/renderer/src/lib/modelSelector.ts` — `modelsForKind`, `speedCostLabel`, `acceptsReferenceFiles`.
- Create `src/renderer/src/lib/modelSelector.test.ts`.
- Create `src/renderer/src/lib/templatePreview.ts` — `templatePreview` (name + model label + truncated prompt).
- Create `src/renderer/src/lib/templatePreview.test.ts`.
- Create `src/renderer/src/lib/turns.ts` — `conversationTurns` (filter + oldest-first sort).
- Create `src/renderer/src/lib/turns.test.ts`.

**Backend (reference-file capture + conversation activity):**
- Modify `src/shared/types.ts` — add `ReferenceFileInput`; add `referenceFiles?` to both request types.
- Modify `src/main/ipc.ts` — persist reference files via `storage.saveInputAsset`; bump conversation `updatedAt` on each new turn.
- Modify `src/main/db.test.ts` — attachments round-trip guard.

**New components:**
- Create `src/renderer/src/components/GenerationTurn.tsx` — one generation's prompt + result (extracted from `ResultView`).
- Create `src/renderer/src/components/OutputFeed.tsx` — scrollable turn list + empty state + lightbox.
- Create `src/renderer/src/components/ModelSelector.tsx` — kind toggle + model cards.
- Create `src/renderer/src/components/ReferenceFiles.tsx` — drop zone + thumbnails, gated by capability.
- Create `src/renderer/src/components/TemplateSelector.tsx` — rich template rows.
- Create `src/renderer/src/components/TextBox.tsx` — prompt textarea + Generate.

**Rewrites / deletions:**
- Rewrite `src/renderer/src/components/Sidebar.tsx` — overlay conversation list (was generations).
- Rewrite `src/renderer/src/App.tsx` — top bar + two-column grid + overlay state + active conversation.
- Delete `src/renderer/src/components/ResultView.tsx` — replaced by `OutputFeed` + `GenerationTurn`.

**Carryover cleanup (Spec A → B):**
- Modify `src/shared/types.ts`, `src/shared/api.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/db.ts` — drop the legacy per-generation delete path.

---

## Task 1: `modelsForKind` / `speedCostLabel` / `acceptsReferenceFiles`

**Files:**
- Create: `src/renderer/src/lib/modelSelector.ts`
- Test: `src/renderer/src/lib/modelSelector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/lib/modelSelector.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_MODELS,
  DEFAULT_VIDEO_MODELS,
  type ModelInfo
} from '@shared/types'
import { acceptsReferenceFiles, modelsForKind, speedCostLabel } from './modelSelector'

describe('modelSelector', () => {
  test('modelsForKind returns only models of that kind', () => {
    expect(modelsForKind('image').map((m) => m.id).sort()).toEqual(
      DEFAULT_IMAGE_MODELS.map((m) => m.id).sort()
    )
    expect(modelsForKind('video').map((m) => m.id).sort()).toEqual(
      DEFAULT_VIDEO_MODELS.map((m) => m.id).sort()
    )
  })

  test('speedCostLabel formats speed + cost dollars', () => {
    const info: ModelInfo = {
      id: 'x',
      label: 'X',
      kind: 'image',
      tags: [],
      speed: 'fast',
      cost: 2,
      acceptsReferenceFiles: false
    }
    expect(speedCostLabel(info)).toBe('Fast · $$')
    expect(speedCostLabel({ ...info, speed: 'slow', cost: 3 })).toBe('Slow · $$$')
  })

  test('acceptsReferenceFiles reads the registry, false for unknown ids', () => {
    expect(acceptsReferenceFiles(DEFAULT_IMAGE_MODEL)).toBe(false)
    expect(acceptsReferenceFiles('nope/unknown')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/lib/modelSelector.test.ts`
Expected: FAIL — cannot resolve `./modelSelector`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/src/lib/modelSelector.ts`:

```ts
import { ALL_MODELS, modelInfo, type GenerationType, type ModelInfo } from '@shared/types'

const SPEED_LABEL: Record<ModelInfo['speed'], string> = {
  fast: 'Fast',
  medium: 'Medium',
  slow: 'Slow'
}

/** Models of a given kind, in registry order. */
export function modelsForKind(kind: GenerationType): ModelInfo[] {
  return ALL_MODELS.filter((m) => m.kind === kind)
}

/** Human hint like "Fast · $$" from a model's speed + cost. */
export function speedCostLabel(info: ModelInfo): string {
  return `${SPEED_LABEL[info.speed]} · ${'$'.repeat(info.cost)}`
}

/** Whether a model id accepts reference-file inputs (gates the UI). */
export function acceptsReferenceFiles(model: string): boolean {
  return modelInfo(model)?.acceptsReferenceFiles ?? false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/renderer/src/lib/modelSelector.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/modelSelector.ts src/renderer/src/lib/modelSelector.test.ts
git commit -m "feat(renderer): model-selector helpers"
```

---

## Task 2: `templatePreview`

**Files:**
- Create: `src/renderer/src/lib/templatePreview.ts`
- Test: `src/renderer/src/lib/templatePreview.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/lib/templatePreview.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { DEFAULT_IMAGE_MODEL, type Template } from '@shared/types'
import { templatePreview } from './templatePreview'

function makeTemplate(model: string, prompt: string): Template {
  return {
    id: 't1',
    name: 'My template',
    kind: 'single-prompt',
    config: { prompt, model, params: {} },
    createdAt: 1,
    updatedAt: 1
  }
}

describe('templatePreview', () => {
  test('resolves a known model id to its friendly label', () => {
    const row = templatePreview(makeTemplate(DEFAULT_IMAGE_MODEL, 'hi'))
    expect(row.name).toBe('My template')
    expect(row.model).toBe('FLUX.2 Flash')
    expect(row.promptPreview).toBe('hi')
  })

  test('falls back to the raw model id when unknown', () => {
    expect(templatePreview(makeTemplate('custom/model', 'hi')).model).toBe('custom/model')
  })

  test('truncates a long prompt with an ellipsis', () => {
    const long = 'x'.repeat(80)
    const row = templatePreview(makeTemplate(DEFAULT_IMAGE_MODEL, long))
    expect(row.promptPreview.endsWith('…')).toBe(true)
    expect(row.promptPreview.length).toBeLessThanOrEqual(61)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/lib/templatePreview.test.ts`
Expected: FAIL — cannot resolve `./templatePreview`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/src/lib/templatePreview.ts`:

```ts
import { modelInfo, type Template } from '@shared/types'

export interface TemplateRow {
  name: string
  model: string
  promptPreview: string
}

const PROMPT_PREVIEW_MAX = 60

/** A template formatted for the selector: name + friendly model + prompt preview. */
export function templatePreview(tpl: Template): TemplateRow {
  const model = modelInfo(tpl.config.model)?.label ?? tpl.config.model
  const prompt = tpl.config.prompt.trim()
  const promptPreview =
    prompt.length > PROMPT_PREVIEW_MAX
      ? `${prompt.slice(0, PROMPT_PREVIEW_MAX).trimEnd()}…`
      : prompt
  return { name: tpl.name, model, promptPreview }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/renderer/src/lib/templatePreview.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/templatePreview.ts src/renderer/src/lib/templatePreview.test.ts
git commit -m "feat(renderer): template-row preview helper"
```

---

## Task 3: `conversationTurns`

**Files:**
- Create: `src/renderer/src/lib/turns.ts`
- Test: `src/renderer/src/lib/turns.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/lib/turns.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { Generation } from '@shared/types'
import { conversationTurns } from './turns'

function gen(id: string, conversationId: string, createdAt: number): Generation {
  return {
    id,
    conversationId,
    type: 'image',
    prompt: id,
    model: 'm',
    status: 'completed',
    params: {},
    assets: [],
    attachments: [],
    error: null,
    createdAt,
    updatedAt: createdAt
  }
}

describe('conversationTurns', () => {
  const all = [gen('a', 'c1', 30), gen('b', 'c1', 10), gen('c', 'c2', 20)]

  test('filters by conversation and sorts oldest-first', () => {
    expect(conversationTurns(all, 'c1').map((g) => g.id)).toEqual(['b', 'a'])
  })

  test('returns an empty array when no conversation is active', () => {
    expect(conversationTurns(all, null)).toEqual([])
  })

  test('returns an empty array for an unknown conversation', () => {
    expect(conversationTurns(all, 'missing')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/lib/turns.test.ts`
Expected: FAIL — cannot resolve `./turns`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/src/lib/turns.ts`:

```ts
import type { Generation } from '@shared/types'

/** Turns of a conversation, oldest first (the feed appends at the bottom). */
export function conversationTurns(
  generations: Generation[],
  conversationId: string | null
): Generation[] {
  if (!conversationId) return []
  return generations
    .filter((g) => g.conversationId === conversationId)
    .sort((a, b) => a.createdAt - b.createdAt)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/renderer/src/lib/turns.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/turns.ts src/renderer/src/lib/turns.test.ts
git commit -m "feat(renderer): conversation-turn grouping helper"
```

---

## Task 4: Reference-file request type + backend capture (B3 backend)

Adds the request field, persists reference files onto the generation via the Spec A
`saveInputAsset` helper, and bumps the conversation's `updatedAt` so the sidebar reflects last
activity. Reference files are **not** sent to fal.

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipc.ts`
- Test: `src/main/db.test.ts` (attachments round-trip guard)

- [ ] **Step 1: Add the `ReferenceFileInput` type and request fields**

In `src/shared/types.ts`, add after the `Attachment` interface (around line 23):

```ts
/** A reference-file input captured in the renderer and sent with a request. */
export interface ReferenceFileInput {
  /** Raw bytes (structured-clone-safe across the IPC bridge). */
  bytes: ArrayBuffer
  contentType: string
}
```

Then add `referenceFiles?` to both request interfaces. In `GenerateImageRequest`, after the
`size?` field:

```ts
  /** Reference-file inputs; persisted onto the generation, not sent to fal. */
  referenceFiles?: ReferenceFileInput[]
```

In `GenerateVideoRequest`, after the `duration?` field:

```ts
  /** Reference-file inputs; persisted onto the generation, not sent to fal. */
  referenceFiles?: ReferenceFileInput[]
```

- [ ] **Step 2: Write the attachments round-trip guard test**

In `src/main/db.test.ts`, add a test (this confirms populated `attachments` serialize through
the JSON column; it may pass on first run and stays as a regression guard):

```ts
test('insertGeneration round-trips attachments', () => {
  db.insertConversation({ id: 'c1', title: 'c', createdAt: 1, updatedAt: 1 })
  const g = makeGeneration('g1', 'c1')
  g.attachments = [{ fileName: '0.png', url: 'media://asset/g1/input/0.png', contentType: 'image/png' }]
  db.insertGeneration(g)
  expect(db.getGeneration('g1')?.attachments).toEqual(g.attachments)
})
```

- [ ] **Step 3: Run the guard test**

Run: `pnpm test src/main/db.test.ts`
Expected: PASS (existing 3 + new test). If it fails, the attachments column/serialization is
broken and must be fixed before proceeding.

- [ ] **Step 4: Wire reference-file capture + conversation activity in `ipc.ts`**

In `src/main/ipc.ts`, extend the type import to include `Attachment` and `ReferenceFileInput`:

```ts
import {
  IPC,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  type Attachment,
  type Conversation,
  type ConversationCreate,
  type Generation,
  type GenerateImageRequest,
  type GenerateVideoRequest,
  type ReferenceFileInput,
  type Template,
  type TemplateCreate,
  type TemplateUpdate
} from '@shared/types'
```

Add two helpers next to `resolveConversationId` (after line 55):

```ts
/** Persist reference-file inputs under the generation and return their metadata. */
function saveReferenceFiles(generationId: string, files?: ReferenceFileInput[]): Attachment[] {
  return (files ?? []).map((f, i) =>
    storage.saveInputAsset(generationId, i, Buffer.from(f.bytes), f.contentType)
  )
}

/** Bump a conversation's updatedAt so the sidebar reflects last activity. */
function touchConversation(id: string): void {
  db.updateConversation(id, {})
  broadcastConversationsChanged()
}
```

Replace `startImageGeneration` (lines 94-125) with:

```ts
function startImageGeneration(req: GenerateImageRequest): { id: string; conversationId: string } {
  const prompt = req.prompt?.trim()
  if (!prompt) throw new Error('Prompt is required.')

  const conversationId = resolveConversationId(prompt, req.conversationId)
  const id = randomUUID()
  const attachments = saveReferenceFiles(id, req.referenceFiles)
  const now = Date.now()
  const gen: Generation = {
    id,
    conversationId,
    type: 'image',
    prompt,
    model: req.model || DEFAULT_IMAGE_MODEL,
    status: 'pending',
    params: {
      numberOfImages: req.numberOfImages ?? 1,
      ...(req.size ? { size: req.size } : {})
    },
    assets: [],
    attachments,
    error: null,
    createdAt: now,
    updatedAt: now
  }

  db.insertGeneration(gen)
  touchConversation(conversationId)
  broadcastGenerationsChanged()

  // Fire-and-forget: the renderer tracks progress via the change broadcast.
  void runGeneration(gen, { ...req, prompt })

  return { id: gen.id, conversationId }
}
```

Replace `startVideoGeneration` (lines 178-206) with:

```ts
function startVideoGeneration(req: GenerateVideoRequest): { id: string; conversationId: string } {
  const prompt = req.prompt?.trim()
  if (!prompt) throw new Error('Prompt is required.')

  const conversationId = resolveConversationId(prompt, req.conversationId)
  const id = randomUUID()
  const attachments = saveReferenceFiles(id, req.referenceFiles)
  const now = Date.now()
  const gen: Generation = {
    id,
    conversationId,
    type: 'video',
    prompt,
    model: req.model || DEFAULT_VIDEO_MODEL,
    status: 'pending',
    params: {
      ...(req.size ? { size: req.size } : {}),
      ...(req.duration ? { duration: req.duration } : {})
    },
    assets: [],
    attachments,
    error: null,
    createdAt: now,
    updatedAt: now
  }

  db.insertGeneration(gen)
  touchConversation(conversationId)
  broadcastGenerationsChanged()
  runVideoGeneration(gen, { ...req, prompt })
  return { id: gen.id, conversationId }
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/ipc.ts src/main/db.test.ts
git commit -m "feat(api): capture reference-file inputs and bump conversation activity"
```

---

## Task 5: `GenerationTurn` + `OutputFeed` (B6); remove `ResultView`

**Files:**
- Create: `src/renderer/src/components/GenerationTurn.tsx`
- Create: `src/renderer/src/components/OutputFeed.tsx`
- Delete: `src/renderer/src/components/ResultView.tsx` (still imported by `App.tsx` until Task 11 — delete it here and `App` will be fixed in Task 11; if typecheck must pass between tasks, defer the delete to Task 11. See Step 4.)

- [ ] **Step 1: Create `GenerationTurn.tsx`** (per-generation body extracted from `ResultView`)

```tsx
import { Loader2 } from 'lucide-react'
import type { Generation } from '@shared/types'
import { modelLabel, relativeTime } from '../lib/format'
import { MediaTile } from './MediaTile'

interface GenerationTurnProps {
  generation: Generation
  onOpenLightbox: (src: string) => void
}

export function GenerationTurn({
  generation,
  onOpenLightbox
}: GenerationTurnProps): React.JSX.Element {
  const progress =
    typeof generation.params.progress === 'number' ? generation.params.progress : null
  const busyLabel =
    generation.status === 'pending'
      ? 'Queued…'
      : generation.type === 'video'
        ? progress !== null
          ? `Generating… ${Math.round(progress)}%`
          : 'Generating video…'
        : 'Generating…'

  return (
    <div className="border-b border-border pb-6 last:border-0">
      <h2 className="mb-1.5 text-[15px] leading-snug font-medium">{generation.prompt}</h2>
      <div className="mb-4 flex items-center gap-2.5 text-xs text-muted-foreground">
        <span>{modelLabel(generation.model)}</span>
        <span>·</span>
        <span>{relativeTime(generation.createdAt)}</span>
      </div>

      {(generation.status === 'pending' || generation.status === 'running') && (
        <div className="flex items-center gap-2.5 py-6 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>{busyLabel}</span>
        </div>
      )}

      {generation.status === 'error' && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          {generation.error ?? 'Generation failed.'}
        </div>
      )}

      {generation.status === 'completed' && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {generation.assets.map((asset) => (
            <MediaTile
              key={asset.fileName}
              generationId={generation.id}
              asset={asset}
              alt={generation.prompt}
              onOpenLightbox={onOpenLightbox}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `OutputFeed.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { Generation } from '@shared/types'
import { GenerationTurn } from './GenerationTurn'
import { Lightbox } from './Lightbox'

interface OutputFeedProps {
  turns: Generation[]
}

export function OutputFeed({ turns }: OutputFeedProps): React.JSX.Element {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to the newest turn whenever one is appended.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns.length])

  if (turns.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <h2 className="font-heading text-lg font-semibold text-foreground">Impresario Studio</h2>
        <p>Describe an image or video and press Generate.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
      {turns.map((gen) => (
        <GenerationTurn key={gen.id} generation={gen} onOpenLightbox={setLightboxSrc} />
      ))}
      <div ref={bottomRef} />
      <Lightbox src={lightboxSrc} alt="" onClose={() => setLightboxSrc(null)} />
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (`ResultView.tsx` still exists and is still imported by `App.tsx`, so the project
compiles. `OutputFeed`/`GenerationTurn` are not yet imported anywhere, which is fine.)

- [ ] **Step 4: Commit** (defer deleting `ResultView.tsx` to Task 11, where `App.tsx` stops importing it)

```bash
git add src/renderer/src/components/GenerationTurn.tsx src/renderer/src/components/OutputFeed.tsx
git commit -m "feat(renderer): output feed with per-turn generation view"
```

---

## Task 6: `ModelSelector` (B2)

**Files:**
- Create: `src/renderer/src/components/ModelSelector.tsx`

- [ ] **Step 1: Create the component**

```tsx
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  modelKind,
  type GenerationType
} from '@shared/types'
import { modelsForKind, speedCostLabel } from '../lib/modelSelector'
import { cn } from '../lib/utils'

interface ModelSelectorProps {
  model: string
  onModelChange: (id: string) => void
}

export function ModelSelector({ model, onModelChange }: ModelSelectorProps): React.JSX.Element {
  const kind = modelKind(model)

  function pickKind(next: GenerationType): void {
    if (next === kind) return
    onModelChange(next === 'video' ? DEFAULT_VIDEO_MODEL : DEFAULT_IMAGE_MODEL)
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
        {(['image', 'video'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => pickKind(k)}
            className={cn(
              'rounded-md px-3 py-1.5 font-medium capitalize transition-colors',
              k === kind ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {modelsForKind(kind).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onModelChange(m.id)}
            className={cn(
              'flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
              m.id === model
                ? 'border-ring bg-accent'
                : 'border-border hover:border-ring/50 hover:bg-accent/40'
            )}
          >
            <span className="text-sm font-medium">{m.label}</span>
            <div className="flex flex-wrap gap-1">
              {m.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">{speedCostLabel(m)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ModelSelector.tsx
git commit -m "feat(renderer): model selector with kind toggle and cards"
```

---

## Task 7: `ReferenceFiles` (B3 UI)

**Files:**
- Create: `src/renderer/src/components/ReferenceFiles.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { acceptsReferenceFiles } from '../lib/modelSelector'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

interface ReferenceFilesProps {
  model: string
  files: File[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
}

export function ReferenceFiles({
  model,
  files,
  onAdd,
  onRemove
}: ReferenceFilesProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [previews, setPreviews] = useState<string[]>([])

  // Object URLs for thumbnails; revoke on change/unmount to avoid leaks.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [files])

  if (!acceptsReferenceFiles(model)) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
        This model doesn’t accept reference files.
      </div>
    )
  }

  function handleFiles(list: FileList | null): void {
    if (!list || list.length === 0) return
    onAdd(Array.from(list))
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-3 py-6 text-center text-[13px] transition-colors',
          dragging ? 'border-ring bg-accent/40' : 'border-border text-muted-foreground'
        )}
      >
        <Upload className="size-5" />
        <span>Drag &amp; drop or click to add reference files</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="group relative overflow-hidden rounded-md border border-border bg-muted"
            >
              {previews[i] && (
                <img
                  src={previews[i]}
                  alt={file.name}
                  className="block aspect-square w-full object-cover"
                />
              )}
              <Button
                variant="secondary"
                size="icon-xs"
                title="Remove"
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                onClick={() => onRemove(i)}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ReferenceFiles.tsx
git commit -m "feat(renderer): reference-files drop zone gated by capability"
```

---

## Task 8: `TemplateSelector` (B4)

**Files:**
- Create: `src/renderer/src/components/TemplateSelector.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { Template } from '@shared/types'
import { templatePreview } from '../lib/templatePreview'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from './ui/select'

interface TemplateSelectorProps {
  templates: Template[]
  onApply: (tpl: Template) => void
  onManage: () => void
}

const MANAGE_VALUE = '__manage__'

export function TemplateSelector({
  templates,
  onApply,
  onManage
}: TemplateSelectorProps): React.JSX.Element {
  function onPick(value: string): void {
    if (value === MANAGE_VALUE) {
      onManage()
      return
    }
    const tpl = templates.find((t) => t.id === value)
    if (tpl) onApply(tpl)
  }

  return (
    <Select value="" onValueChange={onPick}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Start from a template…" />
      </SelectTrigger>
      <SelectContent>
        {templates.map((t) => {
          const row = templatePreview(t)
          return (
            <SelectItem key={t.id} value={t.id}>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{row.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {row.model}
                  {row.promptPreview ? ` · ${row.promptPreview}` : ''}
                </span>
              </div>
            </SelectItem>
          )
        })}
        {templates.length > 0 && <SelectSeparator />}
        <SelectItem value={MANAGE_VALUE}>Manage templates…</SelectItem>
      </SelectContent>
    </Select>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (If the `ui/select` exports differ from those used in `PromptBar.tsx`, mirror
that file's imports — `Select`, `SelectContent`, `SelectItem`, `SelectSeparator`, `SelectTrigger`,
`SelectValue` are all used there.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/TemplateSelector.tsx
git commit -m "feat(renderer): template selector with rich rows"
```

---

## Task 9: `TextBox` (B5)

**Files:**
- Create: `src/renderer/src/components/TextBox.tsx`

- [ ] **Step 1: Create the component** (`Textarea` spreads props to the host element, so `ref` passes through under React 19)

```tsx
import type { GenerationType } from '@shared/types'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'

interface TextBoxProps {
  kind: GenerationType
  prompt: string
  canSubmit: boolean
  onPromptChange: (value: string) => void
  onSubmit: () => void
  textareaRef?: React.Ref<HTMLTextAreaElement>
}

export function TextBox({
  kind,
  prompt,
  canSubmit,
  onPromptChange,
  onSubmit,
  textareaRef
}: TextBoxProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-input/30 p-2.5 pl-3.5 transition-colors focus-within:border-ring">
      <Textarea
        ref={textareaRef}
        rows={2}
        placeholder={
          kind === 'video' ? 'Describe a video to generate…' : 'Describe an image to generate…'
        }
        className="max-h-44 min-h-0 border-0 bg-transparent p-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
          }
        }}
      />
      <div className="flex justify-end">
        <Button size="sm" disabled={!canSubmit} onClick={onSubmit}>
          Generate
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/TextBox.tsx
git commit -m "feat(renderer): standalone prompt text box"
```

---

## Task 10: Rewrite `Sidebar` as the overlay conversation list (B1)

**Files:**
- Rewrite: `src/renderer/src/components/Sidebar.tsx`

- [ ] **Step 1: Replace the entire file** with the conversation list (title + last activity, select / rename / delete)

```tsx
import { useState } from 'react'
import { Pencil, Settings, X } from 'lucide-react'
import type { Conversation } from '@shared/types'
import { relativeTime } from '../lib/format'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface SidebarProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onOpenSettings: () => void
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onRename,
  onOpenSettings
}: SidebarProps): React.JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  function startRename(conv: Conversation): void {
    setEditingId(conv.id)
    setDraft(conv.title)
  }

  function commitRename(): void {
    if (editingId && draft.trim()) onRename(editingId, draft.trim())
    setEditingId(null)
  }

  return (
    <aside className="flex h-full min-h-0 w-[264px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <span className="font-heading font-semibold tracking-tight">Chats</span>
        <Button variant="ghost" size="icon" title="Settings" onClick={onOpenSettings}>
          <Settings />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <div className="px-4 py-6 text-[13px] leading-relaxed text-muted-foreground">
            No conversations yet. Start a new chat to begin.
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                'group relative mb-0.5 flex w-full cursor-pointer flex-col gap-1 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors',
                conv.id === activeId
                  ? 'border-sidebar-border bg-sidebar-accent'
                  : 'hover:bg-sidebar-accent/60'
              )}
              onClick={() => onSelect(conv.id)}
              role="button"
              tabIndex={0}
            >
              {editingId === conv.id ? (
                <Input
                  autoFocus
                  value={draft}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={commitRename}
                  className="h-6 text-[13px]"
                />
              ) : (
                <>
                  <div className="truncate pr-12 text-[13px]">{conv.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {relativeTime(conv.updatedAt)}
                  </div>
                  <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Rename"
                      onClick={(e) => {
                        e.stopPropagation()
                        startRename(conv)
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(conv.id)
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL — `App.tsx` still passes the old `generations`/`onSelect(id)` prop shape to
`Sidebar`. This is expected and fixed in Task 11. (If running tasks where each must typecheck
green, do Task 10 and Task 11 as a single commit.)

- [ ] **Step 3: Commit** (paired with Task 11)

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat(renderer): overlay conversation sidebar"
```

---

## Task 11: Rewrite `App` — top bar, two-column grid, overlay state (B1); delete `ResultView`

**Files:**
- Rewrite: `src/renderer/src/App.tsx`
- Delete: `src/renderer/src/components/ResultView.tsx`

- [ ] **Step 1: Delete the now-unused single-result view**

```bash
git rm src/renderer/src/components/ResultView.tsx
```

- [ ] **Step 2: Replace `App.tsx` entirely**

```tsx
import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { PanelLeft, Plus } from 'lucide-react'
import {
  DEFAULT_IMAGE_MODEL,
  modelKind,
  type GenerateImageRequest,
  type GenerateVideoRequest,
  type ReferenceFileInput,
  type Template
} from '@shared/types'
import { generationsCollection } from './lib/generations'
import { conversationsCollection } from './lib/conversations'
import { templatesCollection } from './lib/templates'
import { conversationTurns } from './lib/turns'
import { acceptsReferenceFiles } from './lib/modelSelector'
import { Sidebar } from './components/Sidebar'
import { ModelSelector } from './components/ModelSelector'
import { ReferenceFiles } from './components/ReferenceFiles'
import { TemplateSelector } from './components/TemplateSelector'
import { TextBox } from './components/TextBox'
import { OutputFeed } from './components/OutputFeed'
import { SettingsModal } from './components/SettingsModal'
import { TemplateEditorModal } from './components/TemplateEditorModal'
import { Button } from './components/ui/button'
import { useKeyStatus } from './hooks/useKeyStatus'

/** Read each File into a structured-clone-safe payload for the IPC bridge. */
async function toReferenceInputs(files: File[]): Promise<ReferenceFileInput[]> {
  return Promise.all(
    files.map(async (f) => ({
      bytes: await f.arrayBuffer(),
      contentType: f.type || 'application/octet-stream'
    }))
  )
}

function App(): React.JSX.Element {
  const { data: genData } = useLiveQuery((q) => q.from({ gen: generationsCollection }))
  const generations = useMemo(() => [...(genData ?? [])], [genData])

  const { data: convData } = useLiveQuery((q) => q.from({ conv: conversationsCollection }))
  const conversations = useMemo(
    () => [...(convData ?? [])].sort((a, b) => b.updatedAt - a.updatedAt),
    [convData]
  )

  const { data: templateData } = useLiveQuery((q) => q.from({ tpl: templatesCollection }))
  const templates = useMemo(
    () => [...(templateData ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [templateData]
  )

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string>(DEFAULT_IMAGE_MODEL)
  const [params, setParams] = useState<{ numberOfImages?: number; size?: string }>({})
  const [referenceFiles, setReferenceFiles] = useState<File[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { status, refresh } = useKeyStatus()
  const hasKey = status?.hasKey ?? false
  const kind = modelKind(model)
  const turns = useMemo(
    () => conversationTurns(generations, activeConversationId),
    [generations, activeConversationId]
  )

  function newChat(): void {
    setActiveConversationId(null)
    setPrompt('')
    setParams({})
    setReferenceFiles([])
    setSidebarOpen(false)
    textareaRef.current?.focus()
  }

  function applyTemplate(tpl: Template): void {
    setPrompt(tpl.config.prompt)
    setModel(tpl.config.model)
    setParams(tpl.config.params)
    if (!acceptsReferenceFiles(tpl.config.model)) setReferenceFiles([])
  }

  async function submit(): Promise<void> {
    if (!hasKey) {
      setSettingsOpen(true)
      return
    }
    const text = prompt.trim()
    if (!text) return

    const referenceInputs = acceptsReferenceFiles(model)
      ? await toReferenceInputs(referenceFiles)
      : []
    setPrompt('')
    setReferenceFiles([])

    const base = {
      prompt: text,
      model,
      conversationId: activeConversationId ?? undefined,
      ...(referenceInputs.length ? { referenceFiles: referenceInputs } : {})
    }
    const { conversationId } =
      kind === 'video'
        ? await window.api.generateVideo(base as GenerateVideoRequest)
        : await window.api.generateImage({ ...base, ...params } as GenerateImageRequest)
    setActiveConversationId(conversationId)
  }

  async function handleDeleteConversation(id: string): Promise<void> {
    await window.api.conversations.delete(id)
    if (activeConversationId === id) setActiveConversationId(null)
  }

  function handleRenameConversation(id: string, title: string): void {
    void window.api.conversations.rename(id, title)
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Button variant="ghost" size="sm" onClick={() => setSidebarOpen((v) => !v)}>
          <PanelLeft />
          Chats
        </Button>
        <Button variant="ghost" size="sm" onClick={newChat}>
          <Plus />
          New chat
        </Button>
      </div>

      {status && !hasKey && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary px-7 py-2.5 text-sm text-secondary-foreground">
          <span>Add your fal.ai API key to start generating.</span>
          <Button size="sm" onClick={() => setSettingsOpen(true)}>
            Add key
          </Button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-px bg-border">
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto bg-background p-4">
          <ModelSelector model={model} onModelChange={setModel} />
          <ReferenceFiles
            model={model}
            files={referenceFiles}
            onAdd={(added) => setReferenceFiles((prev) => [...prev, ...added])}
            onRemove={(i) => setReferenceFiles((prev) => prev.filter((_, idx) => idx !== i))}
          />
        </div>

        <div className="flex min-h-0 flex-col gap-3 bg-background p-4">
          <TemplateSelector
            templates={templates}
            onApply={applyTemplate}
            onManage={() => setTemplatesOpen(true)}
          />
          <TextBox
            kind={kind}
            prompt={prompt}
            canSubmit={prompt.trim().length > 0}
            onPromptChange={setPrompt}
            onSubmit={() => void submit()}
            textareaRef={textareaRef}
          />
          <OutputFeed turns={turns} />
        </div>
      </div>

      {sidebarOpen && (
        <>
          <div className="absolute inset-0 z-10 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 z-20">
            <Sidebar
              conversations={conversations}
              activeId={activeConversationId}
              onSelect={(id) => {
                setActiveConversationId(id)
                setSidebarOpen(false)
              }}
              onDelete={(id) => void handleDeleteConversation(id)}
              onRename={handleRenameConversation}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        </>
      )}

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        status={status}
        onChanged={refresh}
      />
      <TemplateEditorModal
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        templates={templates}
      />
    </div>
  )
}

export default App
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (`App` no longer imports `ResultView` or uses `generations.delete`.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/Sidebar.tsx
git commit -m "feat(renderer): two-column workspace layout with overlay sidebar"
```

---

## Task 12: Drop the legacy per-generation delete path (Spec A → B carryover)

Per the spec carryover note, the sidebar now deletes whole conversations
(`conversations:delete`, which cascades correctly), so the orphan-prone per-generation delete
path is removed entirely.

**Files:**
- Modify: `src/shared/types.ts` (remove `generationsDelete` from `IPC`)
- Modify: `src/shared/api.ts` (remove `generations.delete`)
- Modify: `src/preload/index.ts` (remove the `delete` bridge method)
- Modify: `src/main/ipc.ts` (remove the `IPC.generationsDelete` handler)
- Modify: `src/main/db.ts` (remove unused `deleteGeneration`)

- [ ] **Step 1: Remove the IPC channel**

In `src/shared/types.ts`, delete this line from the `IPC` object (around line 258):

```ts
  generationsDelete: 'generations:delete',
```

- [ ] **Step 2: Remove the API surface**

In `src/shared/api.ts`, delete the `delete` method from the `generations` block (around line 29):

```ts
    delete(id: string): Promise<void>
```

- [ ] **Step 3: Remove the preload bridge method**

In `src/preload/index.ts`, delete from the `generations` block (around line 16):

```ts
    delete: (id) => ipcRenderer.invoke(IPC.generationsDelete, id),
```

- [ ] **Step 4: Remove the main handler**

In `src/main/ipc.ts`, delete the handler (around lines 291-295):

```ts
  ipcMain.handle(IPC.generationsDelete, (_e, id: string) => {
    db.deleteGeneration(id)
    storage.deleteGenerationMedia(id)
    broadcastGenerationsChanged()
  })
```

- [ ] **Step 5: Remove the now-unused db function**

In `src/main/db.ts`, delete (around lines 79-81):

```ts
export function deleteGeneration(id: string): void {
  db.delete(generations).where(eq(generations.id, id)).run()
}
```

- [ ] **Step 6: Typecheck and run the full test suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — typecheck clean (nothing references the removed members), all tests green.
If typecheck flags an unused `storage` or `eq`/`generations` import in `ipc.ts`/`db.ts`, only
remove an import if it is genuinely no longer used elsewhere in that file (both are still used by
other functions, so they should remain).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/shared/api.ts src/preload/index.ts src/main/ipc.ts src/main/db.ts
git commit -m "refactor: drop legacy per-generation delete path (conversations own deletion)"
```

---

## Final Verification

- [ ] **Step 1: Full typecheck, lint, and tests**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 2: Manual walkthrough** (the spec's "Testing" section as a checklist — there is no
  component test harness)

Run: `pnpm dev`, then verify:

- **Layout (B1):** top bar shows `Chats` (toggle) and `New chat`; left column has the model
  selector over the reference-files area; right column has template selector → text box → output
  feed (tallest).
- **Sidebar overlay (B1):** clicking `Chats` floats the list over the left edge with a scrim and
  leaves the workspace width unchanged; clicking the scrim closes it. `New chat` clears the
  workspace, focuses the text box, and (after a generation) a new conversation appears in the list.
  Select / rename / delete a conversation all work; deleting the active one empties the feed.
- **Model selector (B2):** the Image | Video toggle filters the cards; each card shows label,
  tag chips, and a "Fast · $$"-style hint; selecting a card highlights it and switches the text-box
  placeholder.
- **Reference files (B3):** the drop zone appears only for a model with
  `acceptsReferenceFiles: true` (none ship enabled by default — temporarily flip one in
  `DEFAULT_IMAGE_MODELS` to exercise it); otherwise the muted "doesn't accept reference files"
  message shows. Adding/removing files updates the thumbnails; after generating, the files are
  saved under `userData/media/<id>/input/` and recorded in the generation's `attachments`.
- **Template selector (B4):** rows show name + model + truncated prompt; selecting one fills the
  prompt, model, and params; "Manage templates…" opens the editor.
- **Text box (B5):** Enter submits, Shift+Enter inserts a newline; Generate is disabled while empty.
- **Output feed (B6):** submitting appends a turn (prompt + result), the feed scrolls to it, and a
  brand-new chat shows the centered empty-state hint. Progress and error states render per turn.

- [ ] **Step 3: Finish the branch** — use the `superpowers:finishing-a-development-branch` skill.

---

## Self-review notes

- **Spec coverage:** B1 → Tasks 10/11; B2 → Tasks 1/6; B3 → Tasks 4/7; B4 → Tasks 2/8;
  B5 → Task 9; B6 → Tasks 3/5; carryover → Task 12. Component-impact list (App, Sidebar,
  PromptBar split into TextBox + ModelSelector + TemplateSelector, new ReferenceFiles/OutputFeed,
  ResultView reuse) all mapped.
- **Note on `PromptBar.tsx`:** the spec frames B5 as "split — text box stays here or becomes
  `TextBox`." This plan introduces `TextBox` and leaves `PromptBar.tsx` orphaned after Task 11.
  It is no longer imported; delete it during Task 11's commit if desired (`git rm
  src/renderer/src/components/PromptBar.tsx`) — verify with `grep -r PromptBar src` first.
- **Type consistency:** `ReferenceFileInput.bytes: ArrayBuffer` is produced by `File.arrayBuffer()`
  in the renderer and consumed via `Buffer.from(f.bytes)` in main; `referenceFiles?` is optional on
  both request types; `ModelSelector`/`ReferenceFiles`/`TemplateSelector`/`TextBox`/`OutputFeed`/
  `Sidebar` prop shapes match exactly how `App` calls them in Task 11.
