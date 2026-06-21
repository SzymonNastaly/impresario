# Model Catalog, Families & Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 8-model curated selector with a searchable index of all fal.ai image/video models, grouped into version-specific families, with a user-managed favorites list and an explicit task-variant picker.

**Architecture:** A committed generator script fetches fal's catalog into a checked-in JSON (`src/shared/falCatalog.generated.json`). A new runtime module `src/shared/catalog.ts` groups those endpoints into families, overlays curated chips onto the 8 known models, and exposes search/resolution helpers. The selector picks a *family*; a variant picker resolves the concrete fal endpoint id that the existing generate path already consumes. Favorites (family ids) live in `settings.json`.

**Tech Stack:** Electron + React + TypeScript, electron-vite, Vitest (runs under Electron's Node), drizzle/sqlite (unaffected), `tsx` (new devDep, generator only).

## Global Constraints

- `src/shared/types.ts` MUST stay dependency-free (it is imported by main, preload, and renderer). Do not add imports of catalog/runtime modules to it.
- Catalog scope is image+video only: categories `text-to-image`, `image-to-image`, `text-to-video`, `image-to-video`, `reference-to-video`. Everything else is excluded.
- No network at app build or runtime. The fal catalog is fetched only by `pnpm catalog:generate` and committed as JSON.
- Grouping key is fal's version-specific `modelFamily`. When `modelFamily` is empty, the endpoint stands alone as its own family keyed by its endpoint id (no heuristic merging).
- The persisted/request unit stays a single fal endpoint id string (`Generation.model`, `GenerateImageRequest.model`, templates). Do not change the generate IPC payloads or DB schema.
- Curated metadata type stays named `ModelInfo`. `DEFAULT_IMAGE_MODELS` / `DEFAULT_VIDEO_MODELS` remain the curated overlay table and the default-favorites seed.
- Vitest only collects `src/**/*.test.ts`. All unit tests live under `src/`. Components are not unit-tested in this repo (no RTL/jsdom) — keep testable logic in `.ts` helpers and verify components via `pnpm typecheck`.
- Run the full check after each task: `pnpm test` and `pnpm typecheck`.

---

## File Structure

- **Create** `src/shared/falCatalogTransform.ts` — category→modality table + pure raw-entry transform (shared by generator and runtime).
- **Create** `src/shared/falCatalogTransform.test.ts` — transform unit tests.
- **Create** `scripts/generate-fal-catalog.ts` — network fetch/paging, writes the JSON. Run via `tsx`.
- **Create** `src/shared/falCatalog.generated.json` — committed catalog data.
- **Create** `src/shared/catalog.ts` — family grouping, overlay, search, variant resolution, repointed `modelInfo`/`modelKind`/`acceptsReferenceFiles`.
- **Create** `src/shared/catalog.test.ts` — catalog runtime tests (fixture-based).
- **Create** `src/renderer/src/components/VariantSelector.tsx` — task-variant picker in the compose area.
- **Modify** `src/shared/types.ts` — add favorites IPC channels; remove the lookups moved to `catalog.ts`.
- **Modify** `src/shared/api.ts` — add `settings.getFavorites` / `settings.setFavorites`.
- **Modify** `src/main/settings.ts` — favorites read/write + pure seeding helper.
- **Modify** `src/main/settings.test.ts` *(create)* — seeding helper tests.
- **Modify** `src/main/ipc.ts` — favorites handlers.
- **Modify** `src/preload/index.ts` + `src/preload/index.d.ts` — favorites bridge.
- **Modify** `src/renderer/src/lib/modelSelector.ts` + `src/renderer/src/lib/modelSelector.test.ts` — re-point chip/ref helpers at catalog; add selection helpers.
- **Modify** `src/renderer/src/components/ModelSelector.tsx` — family search + favorites UI.
- **Modify** `src/renderer/src/components/ReferenceFiles.tsx` — import `acceptsReferenceFiles` from catalog.
- **Modify** `src/renderer/src/App.tsx` — load/persist favorites, family→variant resolution wiring, mount `VariantSelector`.
- **Modify** `src/shared/models.test.ts` — drop tests for the moved lookups.
- **Modify** `package.json` — `catalog:generate` script + `tsx` devDep.

---

## Task 1: Category modality table + pure transform

**Files:**
- Create: `src/shared/falCatalogTransform.ts`
- Test: `src/shared/falCatalogTransform.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type OutputKind = 'image' | 'video'`
  - `type InputKind = 'text' | 'image'`
  - `interface CategoryModality { input: InputKind; output: OutputKind; acceptsReferenceFiles: boolean; subLabel: string }`
  - `const CATEGORY_MODALITY: Record<string, CategoryModality>`
  - `interface RawFalModel { id?; modelId?; title?; category?; shortDescription?; modelFamily?; deprecated?; removed? }`
  - `interface CatalogModel { id: string; label: string; outputKind: OutputKind; category: string; modelFamily: string; owner: string; description: string }`
  - `function rawEntryToCatalogModel(raw: RawFalModel): CatalogModel | null`

- [ ] **Step 1: Write the failing test**

Create `src/shared/falCatalogTransform.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { CATEGORY_MODALITY, rawEntryToCatalogModel } from './falCatalogTransform'

describe('CATEGORY_MODALITY', () => {
  test('covers exactly the five in-scope categories', () => {
    expect(Object.keys(CATEGORY_MODALITY).sort()).toEqual(
      [
        'image-to-image',
        'image-to-video',
        'reference-to-video',
        'text-to-image',
        'text-to-video'
      ].sort()
    )
  })

  test('image input categories accept reference files', () => {
    expect(CATEGORY_MODALITY['text-to-image'].acceptsReferenceFiles).toBe(false)
    expect(CATEGORY_MODALITY['image-to-image'].acceptsReferenceFiles).toBe(true)
    expect(CATEGORY_MODALITY['image-to-video'].acceptsReferenceFiles).toBe(true)
  })
})

describe('rawEntryToCatalogModel', () => {
  test('maps an in-scope entry, deriving outputKind and owner', () => {
    const out = rawEntryToCatalogModel({
      id: 'fal-ai/wan/v2.7/image-to-video',
      title: 'Wan',
      category: 'image-to-video',
      shortDescription: 'great video',
      modelFamily: 'Wan 2.7'
    })
    expect(out).toEqual({
      id: 'fal-ai/wan/v2.7/image-to-video',
      label: 'Wan',
      outputKind: 'video',
      category: 'image-to-video',
      modelFamily: 'Wan 2.7',
      owner: 'fal-ai',
      description: 'great video'
    })
  })

  test('falls back to modelId, id label, and empty family/description', () => {
    const out = rawEntryToCatalogModel({
      modelId: 'owner/thing/text-to-image',
      category: 'text-to-image'
    })
    expect(out).toMatchObject({
      id: 'owner/thing/text-to-image',
      label: 'owner/thing/text-to-image',
      outputKind: 'image',
      modelFamily: '',
      owner: 'owner',
      description: ''
    })
  })

  test('returns null for out-of-scope category', () => {
    expect(
      rawEntryToCatalogModel({ id: 'x/y/video-to-video', category: 'video-to-video' })
    ).toBeNull()
  })

  test('returns null for deprecated, removed, or id-less entries', () => {
    expect(
      rawEntryToCatalogModel({ id: 'a/b/text-to-image', category: 'text-to-image', deprecated: true })
    ).toBeNull()
    expect(
      rawEntryToCatalogModel({ id: 'a/b/text-to-image', category: 'text-to-image', removed: true })
    ).toBeNull()
    expect(rawEntryToCatalogModel({ category: 'text-to-image' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/shared/falCatalogTransform.test.ts`
Expected: FAIL — cannot resolve `./falCatalogTransform`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/falCatalogTransform.ts`:

```ts
// Pure, dependency-free helpers shared by the catalog generator script
// (scripts/generate-fal-catalog.ts) and the runtime catalog (catalog.ts).

export type OutputKind = 'image' | 'video'
export type InputKind = 'text' | 'image'

export interface CategoryModality {
  input: InputKind
  output: OutputKind
  /** Whether this category takes a reference-image input. */
  acceptsReferenceFiles: boolean
  /** Human label for the task variant, e.g. "Image → Video". */
  subLabel: string
}

/** The only fal categories Impresario can run/render. */
export const CATEGORY_MODALITY: Record<string, CategoryModality> = {
  'text-to-image': {
    input: 'text',
    output: 'image',
    acceptsReferenceFiles: false,
    subLabel: 'Text → Image'
  },
  'image-to-image': {
    input: 'image',
    output: 'image',
    acceptsReferenceFiles: true,
    subLabel: 'Edit'
  },
  'text-to-video': {
    input: 'text',
    output: 'video',
    acceptsReferenceFiles: false,
    subLabel: 'Text → Video'
  },
  'image-to-video': {
    input: 'image',
    output: 'video',
    acceptsReferenceFiles: true,
    subLabel: 'Image → Video'
  },
  'reference-to-video': {
    input: 'image',
    output: 'video',
    acceptsReferenceFiles: true,
    subLabel: 'Reference → Video'
  }
}

/** Shape of a model entry from `https://fal.ai/api/models` (fields we read). */
export interface RawFalModel {
  id?: string
  modelId?: string
  title?: string
  category?: string
  shortDescription?: string
  modelFamily?: string
  deprecated?: boolean
  removed?: boolean
}

/** One bundled catalog endpoint (a single fal model id). */
export interface CatalogModel {
  id: string
  label: string
  outputKind: OutputKind
  category: string
  modelFamily: string
  owner: string
  description: string
}

/**
 * Normalize one raw fal entry into a CatalogModel, or null when it is
 * out of scope (unknown category), deprecated, removed, or has no id.
 */
export function rawEntryToCatalogModel(raw: RawFalModel): CatalogModel | null {
  const id = raw.id ?? raw.modelId
  if (!id) return null
  if (raw.deprecated === true || raw.removed === true) return null
  const category = raw.category ?? ''
  const modality = CATEGORY_MODALITY[category]
  if (!modality) return null
  return {
    id,
    label: raw.title ?? id,
    outputKind: modality.output,
    category,
    modelFamily: raw.modelFamily ?? '',
    owner: id.split('/')[0] ?? '',
    description: raw.shortDescription ?? ''
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/shared/falCatalogTransform.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/shared/falCatalogTransform.ts src/shared/falCatalogTransform.test.ts
git commit -m "feat: category modality table + pure fal catalog transform"
```

---

## Task 2: Generator script + committed catalog JSON

**Files:**
- Create: `scripts/generate-fal-catalog.ts`
- Create: `src/shared/falCatalog.generated.json` (produced by running the script)
- Modify: `package.json`

**Interfaces:**
- Consumes: `rawEntryToCatalogModel`, `CATEGORY_MODALITY`, `CatalogModel` from Task 1.
- Produces: committed `src/shared/falCatalog.generated.json` — a JSON array of `CatalogModel`, sorted by `id`.

> Note: this task requires network access to `fal.ai`. The transform is already
> unit-tested in Task 1; this task's deliverable is the committed data file plus a
> smoke check that it parses and has the expected shape.

- [ ] **Step 1: Add the devDependency and npm script**

Run:

```bash
pnpm add -D tsx
```

Then edit `package.json` scripts to add `catalog:generate` after the `db:generate` line:

```json
    "catalog:generate": "tsx scripts/generate-fal-catalog.ts",
```

- [ ] **Step 2: Write the generator script**

Create `scripts/generate-fal-catalog.ts`:

```ts
// Fetches fal.ai's image/video model catalog and writes a committed JSON file.
// Run manually before a release: `pnpm catalog:generate`. No network happens at
// app build or runtime — the bundled JSON is the single source of truth.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CATEGORY_MODALITY,
  rawEntryToCatalogModel,
  type CatalogModel,
  type RawFalModel
} from '../src/shared/falCatalogTransform'

const PAGE_SIZE = 100
const API = 'https://fal.ai/api/models'

interface ApiPage {
  items: RawFalModel[]
  page: number
  pages: number
}

async function fetchCategory(category: string): Promise<RawFalModel[]> {
  const all: RawFalModel[] = []
  let page = 1
  for (;;) {
    const url = `${API}?categories=${encodeURIComponent(category)}&page=${page}&size=${PAGE_SIZE}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fal catalog fetch failed (${res.status}) for ${url}`)
    const body = (await res.json()) as ApiPage
    all.push(...body.items)
    if (page >= body.pages || body.items.length === 0) break
    page += 1
  }
  return all
}

async function main(): Promise<void> {
  const byId = new Map<string, CatalogModel>()
  for (const category of Object.keys(CATEGORY_MODALITY)) {
    const raw = await fetchCategory(category)
    for (const entry of raw) {
      const model = rawEntryToCatalogModel(entry)
      if (model && !byId.has(model.id)) byId.set(model.id, model)
    }
    console.log(`${category}: ${raw.length} raw`)
  }

  const sorted = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
  const outPath = join(
    fileURLToPath(new URL('.', import.meta.url)),
    '..',
    'src',
    'shared',
    'falCatalog.generated.json'
  )
  writeFileSync(outPath, JSON.stringify(sorted, null, 2) + '\n')
  console.log(`Wrote ${sorted.length} models to ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 3: Run the generator**

Run: `pnpm catalog:generate`
Expected: per-category counts logged, then `Wrote <N> models …` with N in the high hundreds, and `src/shared/falCatalog.generated.json` created.

- [ ] **Step 4: Smoke-check the output**

Run:

```bash
node -e "const m=require('./src/shared/falCatalog.generated.json'); if(!Array.isArray(m)||m.length<100) throw new Error('too few: '+m.length); const e=m[0]; for(const k of ['id','label','outputKind','category','modelFamily','owner','description']) if(!(k in e)) throw new Error('missing key '+k); if(!m.some(x=>x.outputKind==='video')) throw new Error('no video models'); console.log('ok',m.length)"
```

Expected: `ok <N>` (N ≥ 100, both image and video present).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/generate-fal-catalog.ts src/shared/falCatalog.generated.json
git commit -m "feat: fal catalog generator script + committed catalog JSON"
```

---

## Task 3: Catalog runtime module (families, overlay, resolution)

**Files:**
- Create: `src/shared/catalog.ts`
- Test: `src/shared/catalog.test.ts`

**Interfaces:**
- Consumes: `CatalogModel`, `CATEGORY_MODALITY`, `OutputKind`, `InputKind` (Task 1); `falCatalog.generated.json` (Task 2); `ModelInfo`, `DEFAULT_IMAGE_MODELS`, `DEFAULT_VIDEO_MODELS`, `GenerationType` from `./types`.
- Produces (used by Tasks 4–7):
  - `interface Variant { endpointId: string; category: string; inputKind: InputKind; outputKind: OutputKind; subLabel: string; acceptsReferenceFiles: boolean; overlay?: ModelInfo }`
  - `interface Family { id: string; label: string; owner: string; outputs: Set<OutputKind>; variants: Variant[] }`
  - `function buildFamilies(models: CatalogModel[], overlays: ModelInfo[]): Family[]`
  - `function families(): Family[]`
  - `function familiesForOutput(kind: GenerationType): Family[]`
  - `function searchFamilies(kind: GenerationType, query: string): Family[]`
  - `function familyById(id: string): Family | undefined`
  - `function variantsForOutput(family: Family, kind: GenerationType): Variant[]`
  - `function resolveVariant(family: Family, kind: GenerationType, hasReference: boolean): Variant | undefined`
  - `function endpointInfo(endpointId: string): { family: Family; variant: Variant } | undefined`
  - `function modelKind(endpointId: string): GenerationType`
  - `function modelInfo(endpointId: string): ModelInfo | undefined`
  - `function acceptsReferenceFiles(endpointId: string): boolean`
  - `function defaultFavoriteFamilyIds(): string[]`

- [ ] **Step 1: Write the failing test**

Create `src/shared/catalog.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { CatalogModel } from './falCatalogTransform'
import type { ModelInfo } from './types'
import {
  buildFamilies,
  endpointInfoFrom,
  resolveVariant,
  searchFamiliesIn,
  variantsForOutput
} from './catalog'

const MODELS: CatalogModel[] = [
  {
    id: 'fal-ai/wan/v2.7/text-to-video',
    label: 'Wan Text to Video',
    outputKind: 'video',
    category: 'text-to-video',
    modelFamily: 'Wan 2.7',
    owner: 'fal-ai',
    description: 'wan t2v'
  },
  {
    id: 'fal-ai/wan/v2.7/image-to-video',
    label: 'Wan Image to Video',
    outputKind: 'video',
    category: 'image-to-video',
    modelFamily: 'Wan 2.7',
    owner: 'fal-ai',
    description: 'wan i2v'
  },
  {
    id: 'fal-ai/wan/v2.7/image-to-video/turbo',
    label: 'Wan Turbo',
    outputKind: 'video',
    category: 'image-to-video',
    modelFamily: 'Wan 2.7',
    owner: 'fal-ai',
    description: 'wan i2v turbo'
  },
  {
    id: 'fal-ai/flux-2/flash',
    label: 'FLUX.2 Flash',
    outputKind: 'image',
    category: 'text-to-image',
    modelFamily: '',
    owner: 'fal-ai',
    description: 'fast flux'
  }
]

const OVERLAYS: ModelInfo[] = [
  {
    id: 'fal-ai/flux-2/flash',
    label: 'FLUX.2 Flash',
    kind: 'image',
    tags: ['Fast drafts'],
    speed: 'fast',
    cost: 1,
    acceptsReferenceFiles: false
  }
]

describe('buildFamilies', () => {
  const fams = buildFamilies(MODELS, OVERLAYS)

  test('groups by modelFamily, leaves blank-family endpoints standalone', () => {
    const wan = fams.find((f) => f.id === 'Wan 2.7')
    expect(wan?.variants).toHaveLength(3)
    expect(wan?.outputs.has('video')).toBe(true)
    const flux = fams.find((f) => f.id === 'fal-ai/flux-2/flash')
    expect(flux?.label).toBe('FLUX.2 Flash')
    expect(flux?.variants).toHaveLength(1)
  })

  test('attaches curated overlay by endpoint id', () => {
    const flux = fams.find((f) => f.id === 'fal-ai/flux-2/flash')
    expect(flux?.variants[0].overlay?.tags).toEqual(['Fast drafts'])
    const wan = fams.find((f) => f.id === 'Wan 2.7')
    expect(wan?.variants[0].overlay).toBeUndefined()
  })

  test('disambiguates duplicate sub-labels within a family', () => {
    const wan = fams.find((f) => f.id === 'Wan 2.7')!
    const i2v = wan.variants.filter((v) => v.category === 'image-to-video')
    const labels = i2v.map((v) => v.subLabel).sort()
    expect(labels).toEqual(['Image → Video', 'Image → Video (turbo)'])
  })
})

describe('variantsForOutput / resolveVariant', () => {
  const fams = buildFamilies(MODELS, OVERLAYS)
  const wan = fams.find((f) => f.id === 'Wan 2.7')!

  test('variantsForOutput filters by output kind', () => {
    expect(variantsForOutput(wan, 'video')).toHaveLength(3)
    expect(variantsForOutput(wan, 'image')).toHaveLength(0)
  })

  test('resolveVariant picks text-to-video when no reference', () => {
    expect(resolveVariant(wan, 'video', false)?.category).toBe('text-to-video')
  })

  test('resolveVariant prefers image-to-video with a reference', () => {
    expect(resolveVariant(wan, 'video', true)?.category).toBe('image-to-video')
  })

  test('resolveVariant falls back to any variant of the kind', () => {
    const flux = fams.find((f) => f.id === 'fal-ai/flux-2/flash')!
    expect(resolveVariant(flux, 'image', true)?.category).toBe('text-to-image')
    expect(resolveVariant(flux, 'video', false)).toBeUndefined()
  })
})

describe('searchFamiliesIn', () => {
  const fams = buildFamilies(MODELS, OVERLAYS)

  test('matches label/owner/id/description, restricted to output kind', () => {
    expect(searchFamiliesIn(fams, 'video', 'wan').map((f) => f.id)).toEqual(['Wan 2.7'])
    expect(searchFamiliesIn(fams, 'image', 'wan')).toEqual([])
    expect(searchFamiliesIn(fams, 'image', 'flux').map((f) => f.id)).toEqual([
      'fal-ai/flux-2/flash'
    ])
  })
})

describe('endpointInfoFrom', () => {
  const fams = buildFamilies(MODELS, OVERLAYS)

  test('looks up family + variant by endpoint id', () => {
    const info = endpointInfoFrom(fams, 'fal-ai/wan/v2.7/image-to-video')
    expect(info?.family.id).toBe('Wan 2.7')
    expect(info?.variant.outputKind).toBe('video')
    expect(endpointInfoFrom(fams, 'nope/unknown')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/shared/catalog.test.ts`
Expected: FAIL — cannot resolve `./catalog`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/catalog.ts`:

```ts
// Runtime model catalog: groups the bundled fal endpoints (falCatalog.generated.json)
// into version-specific families, overlays curated chips onto the known models, and
// resolves the concrete endpoint a generation should run.

import generated from './falCatalog.generated.json'
import {
  CATEGORY_MODALITY,
  type CatalogModel,
  type InputKind,
  type OutputKind
} from './falCatalogTransform'
import {
  DEFAULT_IMAGE_MODELS,
  DEFAULT_VIDEO_MODELS,
  type GenerationType,
  type ModelInfo
} from './types'

export interface Variant {
  endpointId: string
  category: string
  inputKind: InputKind
  outputKind: OutputKind
  subLabel: string
  acceptsReferenceFiles: boolean
  overlay?: ModelInfo
}

export interface Family {
  id: string
  label: string
  owner: string
  outputs: Set<OutputKind>
  variants: Variant[]
}

const CURATED: ModelInfo[] = [...DEFAULT_IMAGE_MODELS, ...DEFAULT_VIDEO_MODELS]

/** Build the family index from catalog models + curated overlays. Pure (testable). */
export function buildFamilies(models: CatalogModel[], overlays: ModelInfo[]): Family[] {
  const overlayById = new Map(overlays.map((o) => [o.id, o]))
  const byFamily = new Map<string, Family>()

  for (const m of models) {
    const modality = CATEGORY_MODALITY[m.category]
    if (!modality) continue
    const familyId = m.modelFamily !== '' ? m.modelFamily : m.id
    const familyLabel = m.modelFamily !== '' ? m.modelFamily : m.label
    let fam = byFamily.get(familyId)
    if (!fam) {
      fam = { id: familyId, label: familyLabel, owner: m.owner, outputs: new Set(), variants: [] }
      byFamily.set(familyId, fam)
    }
    fam.outputs.add(m.outputKind)
    fam.variants.push({
      endpointId: m.id,
      category: m.category,
      inputKind: modality.input,
      outputKind: m.outputKind,
      subLabel: modality.subLabel,
      acceptsReferenceFiles: overlayById.get(m.id)?.acceptsReferenceFiles ?? modality.acceptsReferenceFiles,
      overlay: overlayById.get(m.id)
    })
  }

  for (const fam of byFamily.values()) disambiguateSubLabels(fam)
  return [...byFamily.values()]
}

/** Append an id-tail suffix when two variants in a family share a sub-label. */
function disambiguateSubLabels(family: Family): void {
  const counts = new Map<string, number>()
  for (const v of family.variants) counts.set(v.subLabel, (counts.get(v.subLabel) ?? 0) + 1)
  for (const v of family.variants) {
    if ((counts.get(v.subLabel) ?? 0) > 1) {
      const tail = v.endpointId.split('/').pop() ?? ''
      v.subLabel = `${v.subLabel} (${tail})`
    }
  }
}

const ALL_FAMILIES: Family[] = buildFamilies(generated as CatalogModel[], CURATED)
const ENDPOINT_INDEX = new Map<string, { family: Family; variant: Variant }>()
for (const family of ALL_FAMILIES) {
  for (const variant of family.variants) ENDPOINT_INDEX.set(variant.endpointId, { family, variant })
}

export function families(): Family[] {
  return ALL_FAMILIES
}

export function familiesForOutput(kind: GenerationType): Family[] {
  return ALL_FAMILIES.filter((f) => f.outputs.has(kind))
}

export function familyById(id: string): Family | undefined {
  return ALL_FAMILIES.find((f) => f.id === id)
}

export function variantsForOutput(family: Family, kind: GenerationType): Variant[] {
  return family.variants.filter((v) => v.outputKind === kind)
}

/** Search families producing `kind` by label/owner/endpoint id/description. */
export function searchFamiliesIn(source: Family[], kind: GenerationType, query: string): Family[] {
  const q = query.trim().toLowerCase()
  if (q === '') return source.filter((f) => f.outputs.has(kind))
  return source.filter((f) => {
    if (!f.outputs.has(kind)) return false
    if (f.label.toLowerCase().includes(q) || f.owner.toLowerCase().includes(q)) return true
    return f.variants.some(
      (v) =>
        v.endpointId.toLowerCase().includes(q) ||
        (v.overlay?.label ?? '').toLowerCase().includes(q)
    )
  })
}

export function searchFamilies(kind: GenerationType, query: string): Family[] {
  return searchFamiliesIn(ALL_FAMILIES, kind, query)
}

const PREFERRED: Record<string, Record<'ref' | 'noref', string[]>> = {
  image: { noref: ['text-to-image'], ref: ['image-to-image'] },
  video: {
    noref: ['text-to-video'],
    ref: ['image-to-video', 'reference-to-video']
  }
}

export function resolveVariant(
  family: Family,
  kind: GenerationType,
  hasReference: boolean
): Variant | undefined {
  const order = PREFERRED[kind][hasReference ? 'ref' : 'noref']
  for (const category of order) {
    const match = family.variants.find((v) => v.category === category)
    if (match) return match
  }
  return family.variants.find((v) => v.outputKind === kind)
}

export function endpointInfoFrom(
  source: Family[],
  endpointId: string
): { family: Family; variant: Variant } | undefined {
  for (const family of source) {
    const variant = family.variants.find((v) => v.endpointId === endpointId)
    if (variant) return { family, variant }
  }
  return undefined
}

export function endpointInfo(
  endpointId: string
): { family: Family; variant: Variant } | undefined {
  return ENDPOINT_INDEX.get(endpointId)
}

/** Output kind of an endpoint id; defaults to image for unknown ids. */
export function modelKind(endpointId: string): GenerationType {
  return ENDPOINT_INDEX.get(endpointId)?.variant.outputKind ?? 'image'
}

/** Curated overlay metadata for an endpoint id, if any. */
export function modelInfo(endpointId: string): ModelInfo | undefined {
  return ENDPOINT_INDEX.get(endpointId)?.variant.overlay
}

/** Whether an endpoint accepts reference-file inputs; false for unknown ids. */
export function acceptsReferenceFiles(endpointId: string): boolean {
  return ENDPOINT_INDEX.get(endpointId)?.variant.acceptsReferenceFiles ?? false
}

/** Family ids of the curated default models — the initial favorites seed. */
export function defaultFavoriteFamilyIds(): string[] {
  const ids = new Set<string>()
  for (const m of CURATED) {
    const info = ENDPOINT_INDEX.get(m.id)
    ids.add(info ? info.family.id : m.id)
  }
  return [...ids]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/shared/catalog.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Verify the bundled data builds families**

Run:

```bash
pnpm test -- src/shared/catalog.test.ts && pnpm typecheck:web
```

Expected: PASS and no type errors (confirms `falCatalog.generated.json` imports cleanly under the web tsconfig).

- [ ] **Step 6: Commit**

```bash
git add src/shared/catalog.ts src/shared/catalog.test.ts
git commit -m "feat: catalog runtime module with families, overlay, and resolution"
```

---

## Task 4: Migrate lookups off types.ts onto catalog.ts

**Files:**
- Modify: `src/shared/types.ts` (remove `ALL_MODELS`, `modelInfo`, `modelKind`)
- Modify: `src/shared/models.test.ts`
- Modify: `src/renderer/src/lib/modelSelector.ts`
- Modify: `src/renderer/src/lib/modelSelector.test.ts`
- Modify: `src/renderer/src/components/ReferenceFiles.tsx`
- Modify: `src/renderer/src/App.tsx` (import sites only)

**Interfaces:**
- Consumes: `modelKind`, `modelInfo`, `acceptsReferenceFiles` from `@shared/catalog` (Task 3).
- Produces: `types.ts` no longer exports `ALL_MODELS`/`modelInfo`/`modelKind`; all consumers import catalog-aware lookups from `@shared/catalog`.

- [ ] **Step 1: Update the tests first (red)**

In `src/shared/models.test.ts`, replace the whole file with curated-data invariants only (the moved-function tests now live in `catalog.test.ts`):

```ts
import { describe, expect, test } from 'vitest'
import { DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_MODELS, DEFAULT_VIDEO_MODELS } from './types'

describe('curated model overlay', () => {
  test('image and video models carry metadata', () => {
    for (const m of [...DEFAULT_IMAGE_MODELS, ...DEFAULT_VIDEO_MODELS]) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(Array.isArray(m.tags)).toBe(true)
      expect(['fast', 'medium', 'slow']).toContain(m.speed)
      expect([1, 2, 3]).toContain(m.cost)
      expect(typeof m.acceptsReferenceFiles).toBe('boolean')
    }
  })

  test('DEFAULT_IMAGE_MODEL is the first curated image model', () => {
    expect(DEFAULT_IMAGE_MODEL).toBe(DEFAULT_IMAGE_MODELS[0].id)
  })
})
```

In `src/renderer/src/lib/modelSelector.test.ts`, replace the imports line and drop the `modelsForKind` test:

```ts
import { describe, expect, test } from 'vitest'
import { DEFAULT_IMAGE_MODEL, type ModelInfo } from '@shared/types'
import { acceptsReferenceFiles, speedCostLabel } from './modelSelector'

describe('modelSelector', () => {
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

  test('acceptsReferenceFiles reads the catalog, false for unknown ids', () => {
    expect(acceptsReferenceFiles(DEFAULT_IMAGE_MODEL)).toBe(false)
    expect(acceptsReferenceFiles('nope/unknown')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify red**

Run: `pnpm test -- src/shared/models.test.ts src/renderer/src/lib/modelSelector.test.ts`
Expected: FAIL — `modelSelector.ts` still defines `modelsForKind` and imports `ALL_MODELS`/`modelInfo` from types (or the imports no longer line up).

- [ ] **Step 3: Remove moved exports from `types.ts`**

In `src/shared/types.ts`, delete these now-moved declarations (lines ~248–259):

```ts
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

Leave `ModelInfo`, `DEFAULT_IMAGE_MODELS`, `DEFAULT_VIDEO_MODELS`, `DEFAULT_IMAGE_MODEL`, `DEFAULT_VIDEO_MODEL` intact.

- [ ] **Step 4: Re-point `lib/modelSelector.ts`**

Replace `src/renderer/src/lib/modelSelector.ts` with:

```ts
import type { ModelInfo } from '@shared/types'
import { acceptsReferenceFiles } from '@shared/catalog'

const SPEED_LABEL: Record<ModelInfo['speed'], string> = {
  fast: 'Fast',
  medium: 'Medium',
  slow: 'Slow'
}

/** Human hint like "Fast · $$" from a curated model's speed + cost. */
export function speedCostLabel(info: ModelInfo): string {
  return `${SPEED_LABEL[info.speed]} · ${'$'.repeat(info.cost)}`
}

/** Re-exported so renderer components have one import site for ref gating. */
export { acceptsReferenceFiles }
```

- [ ] **Step 5: Re-point `ReferenceFiles.tsx` and `App.tsx` imports**

In `src/renderer/src/components/ReferenceFiles.tsx`, change the import on line 3 from:

```ts
import { acceptsReferenceFiles } from '../lib/modelSelector'
```

(no change needed — `lib/modelSelector` still re-exports it). Verify it still resolves; no edit required if the re-export from Step 4 is in place.

In `src/renderer/src/App.tsx`, change the `modelKind` import. Line 16 currently:

```ts
import { acceptsReferenceFiles } from './lib/modelSelector'
```

Find the import of `modelKind` (currently from `@shared/types`, used at line 66) and move it to catalog. Update the `@shared/types` import to drop `modelKind`, and add:

```ts
import { modelKind } from '@shared/catalog'
```

- [ ] **Step 6: Run tests + typecheck (green)**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, no type errors. (`@shared/catalog` resolves via the existing alias in both vite and vitest configs.)

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/shared/models.test.ts src/renderer/src/lib/modelSelector.ts src/renderer/src/lib/modelSelector.test.ts src/renderer/src/App.tsx
git commit -m "refactor: move model lookups from types to catalog module"
```

---

## Task 5: Favorites persistence + IPC

**Files:**
- Modify: `src/main/settings.ts`
- Create: `src/main/settings.test.ts`
- Modify: `src/shared/types.ts` (IPC channel names)
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/shared/api.ts`

**Interfaces:**
- Consumes: `defaultFavoriteFamilyIds` from `@shared/catalog` (Task 3).
- Produces:
  - `function seededFavorites(stored: string[] | undefined, seeds: string[]): string[]`
  - `function getFavorites(): string[]`
  - `function setFavorites(ids: string[]): void`
  - IPC names `IPC.settingsGetFavorites = 'settings:get-favorites'`, `IPC.settingsSetFavorites = 'settings:set-favorites'`
  - `window.api.settings.getFavorites(): Promise<string[]>` and `setFavorites(ids: string[]): Promise<string[]>`

- [ ] **Step 1: Write the failing test for the seeding helper**

Create `src/main/settings.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { seededFavorites } from './settings'

describe('seededFavorites', () => {
  test('returns the seeds when nothing is stored yet', () => {
    expect(seededFavorites(undefined, ['a', 'b'])).toEqual(['a', 'b'])
  })

  test('returns the stored list once it exists, even if empty', () => {
    expect(seededFavorites(['x'], ['a', 'b'])).toEqual(['x'])
    expect(seededFavorites([], ['a', 'b'])).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/main/settings.test.ts`
Expected: FAIL — `seededFavorites` is not exported.

- [ ] **Step 3: Implement favorites in `settings.ts`**

Edit `src/main/settings.ts`. Add the catalog import at the top:

```ts
import { defaultFavoriteFamilyIds } from '@shared/catalog'
```

Extend the `Settings` interface:

```ts
interface Settings {
  saveDir?: string
  favorites?: string[]
}
```

Append these exports at the end of the file:

```ts
/** Stored favorites if initialized, otherwise the seed list. Pure (testable). */
export function seededFavorites(stored: string[] | undefined, seeds: string[]): string[] {
  return stored ?? seeds
}

/** Favorite family ids; seeds (and persists) the curated defaults on first read. */
export function getFavorites(): string[] {
  const current = read()
  if (current.favorites === undefined) {
    const seeded = defaultFavoriteFamilyIds()
    write({ ...current, favorites: seeded })
    return seeded
  }
  return current.favorites
}

export function setFavorites(ids: string[]): void {
  write({ ...read(), favorites: ids })
}
```

- [ ] **Step 4: Run to verify the helper test passes**

Run: `pnpm test -- src/main/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Add IPC channel names**

In `src/shared/types.ts`, inside the `IPC` object after `settingsSetSaveDir`, add:

```ts
  // settings: favorite model families
  settingsGetFavorites: 'settings:get-favorites',
  settingsSetFavorites: 'settings:set-favorites',
```

- [ ] **Step 6: Wire main handlers**

In `src/main/ipc.ts`, add the settings import for the new functions (find the existing `import * as settings` / `from './settings'` line and include `getFavorites`, `setFavorites`), then register handlers next to the save-dir handlers:

```ts
  ipcMain.handle(IPC.settingsGetFavorites, () => settings.getFavorites())
  ipcMain.handle(IPC.settingsSetFavorites, (_e, ids: string[]) => {
    settings.setFavorites(ids)
    return ids
  })
```

(Match the existing import style in `ipc.ts` — if it uses named imports from `./settings`, add `getFavorites`/`setFavorites` there; if a namespace import, use `settings.getFavorites`.)

- [ ] **Step 7: Wire the preload bridge**

In `src/preload/index.ts`, inside the `settings: { … }` object after `setSaveDir`, add:

```ts
    getFavorites: () => ipcRenderer.invoke(IPC.settingsGetFavorites),
    setFavorites: (ids: string[]) => ipcRenderer.invoke(IPC.settingsSetFavorites, ids)
```

In `src/shared/api.ts`, extend the `settings` block of `ImpresarioApi`:

```ts
    /** Favorite model family ids. */
    getFavorites(): Promise<string[]>
    /** Persist the favorite family ids; returns the saved list. */
    setFavorites(ids: string[]): Promise<string[]>
```

If `src/preload/index.d.ts` re-declares the api surface, mirror the same two methods there (otherwise it imports `ImpresarioApi` and needs no change — check before editing).

- [ ] **Step 8: Run full check**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/main/settings.ts src/main/settings.test.ts src/shared/types.ts src/main/ipc.ts src/preload/index.ts src/preload/index.d.ts src/shared/api.ts
git commit -m "feat: favorite model families persisted in settings + IPC"
```

---

## Task 6: ModelSelector — family search + favorites UI

**Files:**
- Modify: `src/renderer/src/components/ModelSelector.tsx`

**Interfaces:**
- Consumes: `familiesForOutput`, `searchFamilies`, `resolveVariant`, `endpointInfo`, `modelKind`, `variantsForOutput`, `type Family` from `@shared/catalog`; `speedCostLabel` from `../lib/modelSelector`; `DEFAULT_IMAGE_MODEL`, `DEFAULT_VIDEO_MODEL` from `@shared/types`.
- Produces: a `<ModelSelector>` whose props become:
  `{ model: string; onModelChange: (id: string) => void; favorites: string[]; onToggleFavorite: (familyId: string) => void }`

- [ ] **Step 1: Rewrite the component**

Replace `src/renderer/src/components/ModelSelector.tsx` with:

```tsx
import { useState } from 'react'
import { Search, Star } from 'lucide-react'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  type GenerationType
} from '@shared/types'
import {
  endpointInfo,
  familiesForOutput,
  resolveVariant,
  searchFamilies,
  type Family
} from '@shared/catalog'
import { modelKind } from '@shared/catalog'
import { speedCostLabel } from '../lib/modelSelector'
import { cn } from '../lib/utils'

interface ModelSelectorProps {
  model: string
  onModelChange: (id: string) => void
  favorites: string[]
  onToggleFavorite: (familyId: string) => void
}

export function ModelSelector({
  model,
  onModelChange,
  favorites,
  onToggleFavorite
}: ModelSelectorProps): React.JSX.Element {
  const kind = modelKind(model)
  const [query, setQuery] = useState('')
  const selectedFamilyId = endpointInfo(model)?.family.id

  function pickKind(next: GenerationType): void {
    if (next === kind) return
    onModelChange(next === 'video' ? DEFAULT_VIDEO_MODEL : DEFAULT_IMAGE_MODEL)
  }

  function pickFamily(family: Family): void {
    const variant = resolveVariant(family, kind, false)
    if (variant) onModelChange(variant.endpointId)
  }

  const favoriteSet = new Set(favorites)
  const results =
    query.trim() === ''
      ? familiesForOutput(kind).filter((f) => favoriteSet.has(f.id))
      : searchFamilies(kind, query)

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

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${kind} models…`}
          className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-ring"
        />
      </div>

      {query.trim() === '' && (
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Favorites
        </span>
      )}

      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {results.length === 0 && (
          <span className="px-1 py-2 text-xs text-muted-foreground">
            {query.trim() === '' ? 'No favorites yet — search to add some.' : 'No models match.'}
          </span>
        )}
        {results.map((family) => {
          const defaultVariant = resolveVariant(family, kind, false)
          const overlay = defaultVariant?.overlay
          const isSelected = family.id === selectedFamilyId
          const isFavorite = favoriteSet.has(family.id)
          return (
            <div
              key={family.id}
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2.5 transition-colors',
                isSelected
                  ? 'border-ring bg-accent'
                  : 'border-border hover:border-ring/50 hover:bg-accent/40'
              )}
            >
              <button
                type="button"
                onClick={() => pickFamily(family)}
                className="flex flex-1 flex-col gap-1.5 text-left"
              >
                <span className="text-sm font-medium">{family.label}</span>
                {overlay ? (
                  <>
                    <div className="flex flex-wrap gap-1">
                      {overlay.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{speedCostLabel(overlay)}</span>
                  </>
                ) : (
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">
                    {family.owner}
                    {defaultVariant ? ` · ${defaultVariant.subLabel}` : ''}
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                onClick={() => onToggleFavorite(family.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <Star className={cn('size-4', isFavorite && 'fill-current text-foreground')} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck:web`
Expected: FAIL — `App.tsx` does not yet pass `favorites`/`onToggleFavorite` (fixed in Task 7). The `ModelSelector.tsx` file itself must contribute no errors; if other errors mention `ModelSelector` props, that is expected and resolved in Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ModelSelector.tsx
git commit -m "feat: family search + favorites UI in ModelSelector"
```

---

## Task 7: VariantSelector + App wiring

**Files:**
- Create: `src/renderer/src/components/VariantSelector.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `endpointInfo`, `variantsForOutput`, `modelKind`, `type Variant` from `@shared/catalog`; favorites IPC from Task 5; `ModelSelector` props from Task 6.
- Produces: `<VariantSelector model onModelChange />`; App owning `favorites` state and a `toggleFavorite` handler.

- [ ] **Step 1: Write the VariantSelector component**

Create `src/renderer/src/components/VariantSelector.tsx`:

```tsx
import { endpointInfo, modelKind, variantsForOutput } from '@shared/catalog'
import { cn } from '../lib/utils'

interface VariantSelectorProps {
  model: string
  onModelChange: (id: string) => void
}

/** Task-variant picker for the selected family (e.g. Text→Video vs Image→Video). */
export function VariantSelector({ model, onModelChange }: VariantSelectorProps): React.JSX.Element | null {
  const info = endpointInfo(model)
  if (!info) return null
  const kind = modelKind(model)
  const variants = variantsForOutput(info.family, kind)
  if (variants.length <= 1) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {variants.map((v) => (
        <button
          key={v.endpointId}
          type="button"
          onClick={() => onModelChange(v.endpointId)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition-colors',
            v.endpointId === model
              ? 'border-ring bg-accent text-foreground'
              : 'border-border text-muted-foreground hover:border-ring/50'
          )}
        >
          {v.subLabel}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Wire favorites + VariantSelector into App.tsx**

In `src/renderer/src/App.tsx`:

Add imports near the other component imports:

```ts
import { VariantSelector } from './components/VariantSelector'
```

Add favorites state with the other `useState` hooks (after `templatesOpen`):

```ts
  const [favorites, setFavorites] = useState<string[]>([])
```

Load favorites once on mount (place with other effects; add a `useEffect` import if missing):

```ts
  useEffect(() => {
    void window.api.settings.getFavorites().then(setFavorites)
  }, [])
```

Add the toggle handler near `changeModel`:

```ts
  function toggleFavorite(familyId: string): void {
    setFavorites((prev) => {
      const next = prev.includes(familyId)
        ? prev.filter((id) => id !== familyId)
        : [...prev, familyId]
      void window.api.settings.setFavorites(next)
      return next
    })
  }
```

Update the `<ModelSelector>` usage (around line 162) to pass the new props:

```tsx
          <ModelSelector
            model={model}
            onModelChange={changeModel}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
          />
```

Mount `<VariantSelector>` in the compose column, directly above the `<TemplateSelector>` (around line 172):

```tsx
          <VariantSelector model={model} onModelChange={changeModel} />
```

- [ ] **Step 3: Typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS, no type errors.

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev`

Verify:
- Selector lists the seeded favorite families for the active image/video toggle.
- Typing a query (e.g. "wan") replaces favorites with search results for the current kind.
- The star toggles a family in/out of favorites; clearing the search shows the updated favorites.
- Selecting a family with multiple variants shows the VariantSelector chips; switching chips changes the active variant.
- Switching the image/video toggle reseeds to that kind's default model and updates favorites/search.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/VariantSelector.tsx src/renderer/src/App.tsx
git commit -m "feat: variant picker + favorites wiring in compose flow"
```

---

## Self-Review notes

- **Spec coverage:** all models via bundled index (Tasks 1–2); curated overlay (Task 3); search current-kind only (Tasks 3, 6); favorites seeded from curated, add/remove, top-when-empty / results-when-querying (Tasks 5–7); families by `modelFamily` with standalone fallback (Task 3); explicit variant picker with `resolveVariant` default, auto-switch deferred to phase 2 (Tasks 3, 7); output toggle retained (Task 6); generator script + committed JSON (Task 2). Persisted endpoint-id unit and unchanged generate path preserved (Task 4 keeps `model: string`).
- **Deviations from spec (intentional):** curated type keeps the name `ModelInfo` (no `ModelOverlay` rename) and the catalog-aware lookups live in `catalog.ts` rather than `types.ts`, to keep `types.ts` dependency-free and avoid a wide rename. The blank-`modelFamily` fallback is "stand alone as own family" (no id-prefix heuristic), matching the spec's stated simplification.
- **Phase 2 (out of scope):** reactive reference-drop variant auto-switching — `resolveVariant` already ships and is used for defaults.
