# Searchable full-catalog model selection with families & favorites

Date: 2026-06-21

## Problem

The model selector offers a hand-curated set of 8 models (4 image, 4 video) defined
in `src/shared/types.ts`. Users want:

1. Access to **all** image/video models fal.ai offers, not just the curated 8.
2. **Search** across that catalog.
3. A **favorites** concept: the current 8 are the default favorites; users can add and
   remove favorites. Favorites show at the top when the search box is empty; a non-empty
   query replaces them with search results.
4. The fal model index **coupled into the source code** — new fal models require a new
   Impresario release (no runtime catalog fetch).
5. Related endpoints **grouped into families**: e.g. searching "wan" surfaces a family,
   and the concrete task variant (text-to-video, image-to-video, edit, …) is chosen at
   generation time, with a manual picker. This sets up a future where dragging in a
   reference image auto-switches the variant.

## Decisions (from brainstorming)

- **Scope:** image + video categories only (the app can only run/render those).
- **Metadata:** curated overlay on a bulk index — the bulk catalog carries minimal
  metadata; the 8 curated models keep their rich chips (tags/speed/cost) via an overlay
  matched by endpoint id.
- **Index generation:** a committed generator script + checked-in JSON. Run manually
  before a release. No network at build or runtime.
- **Favorites storage:** `settings.json`, seeded with the families of the current 8.
- **Search scope:** current output kind only (results never mix image/video).
- **Grouping granularity:** by fal's version-specific `modelFamily` (e.g. "Wan 2.7" and
  "Wan 2.5" are separate families).
- **Auto-switching:** phased. Phase 1 (this spec) ships family grouping + search +
  favorites + an explicit variant picker. Reference-drop auto-resolution is a follow-up.
- **Output toggle:** the existing image/video toggle stays, reframed as "output type".
  It filters families to those that can produce the selected output and drives the
  default variant resolution.

## Catalog API reference

`GET https://fal.ai/api/models?categories=<category>&page=<n>&size=<n>` returns:

- Top level: `items[]`, `page`, `size`, `pages`, `total`.
- Per item (fields we use): `id`/`modelId`, `title`, `category`, `shortDescription`,
  `modelFamily`, `deprecated`, `removed`. (Also present but unused: `group`,
  `thumbnailUrl`, pricing, etc. `group.key` is inconsistent across variants — we do
  **not** group by it; `modelFamily` is the grouping key.)

Relevant categories and their modality:

| category            | input | output | accepts reference files |
|---------------------|-------|--------|-------------------------|
| `text-to-image`     | text  | image  | no                      |
| `image-to-image`    | image | image  | yes (edit)              |
| `text-to-video`     | text  | video  | no                      |
| `image-to-video`    | image | video  | yes                     |
| `reference-to-video`| image | video  | yes                     |

`video-to-video` is excluded from this scope (input is a video, which the compose flow
does not yet support). The generator includes only the five categories above.

## Architecture

### 1. Generated catalog (build-time, committed)

**`scripts/generate-fal-catalog.mjs`** — invoked via a new `pnpm catalog:generate`
script in `package.json`. Responsibilities:

- Page through `https://fal.ai/api/models` for each of the five in-scope categories.
- Dedupe by endpoint id; drop entries with `deprecated === true` or `removed === true`.
- Run the pure transform (below) to produce catalog entries.
- Write **`src/shared/falCatalog.generated.json`**, sorted by `id` for clean diffs.

The **pure transform** (`rawEntryToCatalogModel(raw)` → `CatalogModel | null`) is
exported separately from the network/paging code so it can be unit-tested without a
network call. It returns `null` for out-of-scope or deprecated/removed entries.

A generated catalog entry (per endpoint):

```ts
interface CatalogModel {
  id: string            // fal endpoint id, e.g. "fal-ai/wan/v2.7/image-to-video"
  label: string         // raw.title
  outputKind: 'image' | 'video'   // derived from category
  category: string      // raw.category (one of the five)
  modelFamily: string   // raw.modelFamily, or '' when absent
  owner: string         // first id segment owner, e.g. "fal-ai"
  description: string    // raw.shortDescription ?? ''
}
```

A small **`src/shared/falCatalog.generated.json`** is committed and checked in. To keep
PRs reviewable and tests deterministic, the runtime code imports this JSON; tests for
`catalog.ts` use a small fixture rather than the full generated file where practical.

### 2. Catalog runtime module — `src/shared/catalog.ts`

Builds **families** from the generated entries at module load, applying the curated
overlay.

```ts
type InputKind = 'text' | 'image'

interface Variant {
  endpointId: string
  category: string
  inputKind: InputKind        // text vs image (reference) input
  outputKind: 'image' | 'video'
  subLabel: string            // human label, e.g. "Image → Video", "Edit", "Text → Image"
  acceptsReferenceFiles: boolean
  overlay?: ModelOverlay      // curated chips when endpointId matches a curated model
}

interface Family {
  id: string                  // modelFamily, or derived key when modelFamily is ''
  label: string               // modelFamily, or a name derived from owner/id
  owner: string
  outputs: Set<'image' | 'video'>
  variants: Variant[]
}
```

Family id derivation: use `modelFamily` when non-empty. When empty, derive a stable key
from the endpoint id by stripping the trailing modality segment(s) (the function is
documented and unit-tested with the messy real-world ids). Two endpoints with the same
derived/declared family id collapse into one family.

`subLabel` is derived from `category` (a fixed map: `text-to-image → "Text → Image"`,
`image-to-image → "Edit"`, `text-to-video → "Text → Video"`,
`image-to-video → "Image → Video"`, `reference-to-video → "Reference → Video"`), with a
disambiguating suffix from the id tail when two variants in a family share a category
(e.g. `…/turbo` → "Image → Video (Turbo)").

Exposed API:

- `families(): Family[]`
- `familiesForOutput(kind): Family[]` — families whose `outputs` include `kind`.
- `searchFamilies(kind, query): Family[]` — case-insensitive match on family label,
  owner, member endpoint ids, and descriptions; restricted to families producing `kind`.
- `familyById(id): Family | undefined`
- `variantsForOutput(family, kind): Variant[]`
- `resolveVariant(family, kind, hasReference): Variant | undefined` — the resolution
  table below. Used now to pick a default; reused reactively in phase 2.
- `endpointInfo(endpointId): { family: Family; variant: Variant } | undefined`

Resolution table (`resolveVariant`):

| output | reference attached? | preferred categories (in order) |
|--------|---------------------|---------------------------------|
| image  | no                  | `text-to-image`                 |
| image  | yes                 | `image-to-image`                |
| video  | no                  | `text-to-video`                 |
| video  | yes                 | `image-to-video`, `reference-to-video` |

When no preferred category is present in the family, fall back to any variant of the
requested `kind` (so selecting a family always yields a runnable variant).

### 3. Curated overlay & `types.ts` refactor

- Rename the rich per-model metadata shape used for chips to `ModelOverlay` (currently
  `ModelInfo`: `tags`, `speed`, `cost`, `acceptsReferenceFiles`, `maxDurationSec`),
  keyed by endpoint id. The existing `DEFAULT_IMAGE_MODELS`/`DEFAULT_VIDEO_MODELS`
  become the curated overlay table **and** the source for seeding default favorites.
- `acceptsReferenceFiles` is now derived from the variant's category for bulk models;
  the curated overlay can still override it where set.
- `modelInfo(id)`, `modelKind(id)`, and `acceptsReferenceFiles(id)` are repointed at the
  catalog (`endpointInfo`), keeping the existing image-fallback for unknown ids so
  persisted old generations referencing now-absent endpoints still render.
- `DEFAULT_IMAGE_MODEL` / `DEFAULT_VIDEO_MODEL` remain (initial selection in App).

### 4. Favorites — `src/main/settings.ts`

- Add `favorites?: string[]` (family ids) to the `Settings` interface.
- `getFavorites(): string[]` — on first read (field undefined), seed with the family ids
  of the 8 curated models (computed via the catalog) and persist them, so later removals
  stick. Returns the stored list thereafter.
- `setFavorites(ids: string[]): void` — persists the full list.
- IPC channels in `src/shared/types.ts`: `settingsGetFavorites: 'settings:get-favorites'`,
  `settingsSetFavorites: 'settings:set-favorites'`.
- Wire handlers in `src/main/ipc.ts`, the preload bridge, and `ImpresarioApi`
  (`src/shared/api.ts`): `settings.getFavorites(): Promise<string[]>` and
  `settings.setFavorites(ids: string[]): Promise<string[]>`.

### 5. UI

**`ModelSelector.tsx`** (left panel) — rewritten around families:

- Output toggle (image/video) on top, unchanged in appearance; now means "output type".
- A search input below the toggle.
- Favorites list (when query empty): `familiesForOutput(kind)` filtered to favorite ids,
  each row a family card with a filled star to remove from favorites.
- Search results (when query non-empty): `searchFamilies(kind, query)`, each row a family
  card with a star reflecting/toggling favorite membership.
- A family card shows: family label, a kind badge, the count/labels of its variants for
  the current output, and curated chips (tags / speed·cost) when the family's resolved
  default variant has an overlay; otherwise the description.
- Selecting a family calls `resolveVariant(family, kind, hasReference=false)` and reports
  the resolved endpoint id upward via `onModelChange`.
- Toggling the output type re-resolves the currently selected family's default variant
  for the new output (or clears selection if the family can't produce it).

Favorites state lives in the renderer (loaded via `settings.getFavorites()`), mutated
optimistically, and persisted via `settings.setFavorites()`.

**`VariantSelector.tsx`** (new, compose area) — when a family is selected, lists
`variantsForOutput(family, kind)` (e.g. "Text → Video", "Image → Video", "Edit"),
highlighting the active endpoint; choosing one calls `onModelChange` with that variant's
endpoint id. Hidden when the selected family has only one variant for the current output.

**`App.tsx`** — keeps a single `model: string` (the resolved endpoint id) as the source
of truth for the request, templates, and persistence (the generate path, stored
generations, and templates are unchanged). The output toggle and the variant picker both
resolve down to that endpoint id. `changeModel` still clears reference files when the new
endpoint doesn't accept them.

## Phase 2 (out of scope, noted for design continuity)

Make variant resolution reactive: when reference files are added/removed (or output type
changes) re-run `resolveVariant(family, kind, hasReference)` and update `model`
automatically, so dragging in a reference image switches e.g. text-to-video → image-to-
video. The function ships in phase 1; phase 2 only wires it to input changes plus a UX
affordance indicating the auto-switch.

## Testing

- **`src/shared/catalog.test.ts`** (fixture-based): family grouping by `modelFamily` and
  by derived key; category→modality/subLabel mapping; overlay merge onto matching
  endpoints; `resolveVariant` covering all four rows + fallback; `searchFamilies`
  matching and output-kind restriction; `endpointInfo` and unknown-id fallback.
- **Generator transform test**: `rawEntryToCatalogModel` filters non-scope categories,
  excludes `deprecated`/`removed`, derives `outputKind`/`owner`, and assigns
  `modelFamily`.
- **Settings favorites test**: seeds from curated families on first read; add/remove
  persistence round-trips through `settings.json`.
- **`src/shared/models.test.ts`**: updated for the `ModelOverlay` rename and repointed
  `modelInfo`/`modelKind` behavior.

## Files touched

- New: `scripts/generate-fal-catalog.mjs`, `src/shared/falCatalog.generated.json`,
  `src/shared/catalog.ts`, `src/shared/catalog.test.ts`,
  `src/renderer/src/components/VariantSelector.tsx`.
- Changed: `src/shared/types.ts` (ModelOverlay rename, IPC names, repointed lookups),
  `src/shared/api.ts`, `src/main/settings.ts`, `src/main/ipc.ts`, the preload bridge,
  `src/renderer/src/components/ModelSelector.tsx`, `src/renderer/src/App.tsx`,
  `src/renderer/src/lib/modelSelector.ts` (chip helpers), `package.json`
  (`catalog:generate` script), `src/shared/models.test.ts`.
