# Redesign — Spec A: Data Foundation

**Date:** 2026-06-14
**Status:** Approved (design)

Part one of a two-spec app redesign. This spec covers the data/plumbing layer
that the UI redesign (Spec B) builds on. Spec B covers the two-column workspace,
tabbed model selector, reference-files area, template selector, output feed, and
collapsible conversation sidebar.

## Goal

Move from standalone, one-shot generations to **multi-turn conversations**, and
give models **rich metadata** (strengths, speed/cost, capabilities) so the UI can
explain choices to non-expert users. Also lay the data groundwork for
**reference-file attachments** (UI + gating in Spec B; not wired to fal yet).

## Non-goals

- No layout/UI changes (Spec B).
- No new or changed model ids — reuse the current defaults, just add metadata.
- No wiring of attachments into fal generation calls.

## A1. Conversation + Message model

Today each row in the `generations` table is a standalone item. We introduce a
parent **Conversation** and treat each generation as a **turn** within it.

- **New `conversations` table:** `{ id, title, createdAt, updatedAt }`.
  `title` is auto-derived from the first turn's prompt (truncated). It becomes
  user-editable in Spec B; Spec A only auto-derives.
- **Existing `generations` table = the per-turn entity.** Add a `conversationId`
  foreign key and an `attachments` column. We **keep** the table name
  `generations` and the TS type name `Generation` (now carrying `conversationId`)
  rather than renaming to `messages`. Renaming would churn storage, media paths,
  IPC channels, and many renderer files for no functional gain. Each generation
  remains the unit that owns a media folder (`media://asset/<generationId>/…`).

Relationship: a Conversation has many Generations (turns), ordered by
`createdAt`. The Spec B output feed renders all turns of the active conversation.

## A2. Reference-files type (data only)

Add an `attachments` field to the `Generation` type and an `attachments` column
to the `generations` table:

```ts
interface Attachment {
  fileName: string      // filename within the generation's input/ folder
  contentType: string
  url: string           // media:// URL the renderer can render directly
}
```

Spec A scope:
- Define the `Attachment` type and the `attachments` column (json mode, default `[]`).
- Add a storage helper for input files mirroring `saveAsset`, writing under an
  `input/` subfolder of the generation's media dir (e.g.
  `media/<generationId>/input/<n>.<ext>`), returning an `Attachment`.

Deferred to Spec B: capturing files from the UI, showing the reference-files
area, and gating it by model capability. **Not wired to fal** in either spec.

## A3. Model registry with metadata

Replace the `{ id, label }` tuples with a richer `ModelInfo`:

```ts
interface ModelInfo {
  id: string
  label: string
  kind: 'image' | 'video'
  tags: string[]                 // strengths / best-for chips
  speed: 'fast' | 'medium' | 'slow'
  cost: 1 | 2 | 3                // $, $$, $$$
  acceptsReferenceFiles: boolean
  maxDurationSec?: number        // video only
}
```

- `DEFAULT_IMAGE_MODELS` and `DEFAULT_VIDEO_MODELS` become `ModelInfo[]`, using
  the same model ids as today, filled with sensible metadata. (`acceptsReferenceFiles`
  is `false` for all current defaults, since they are text-to-image / text-to-video.)
- Add a combined `ALL_MODELS` array and a `modelInfo(id): ModelInfo | undefined`
  lookup.
- `modelKind(id)` derives from the registry (`modelInfo(id)?.kind ?? 'image'`)
  instead of array membership.

## A4. Migration

A Drizzle migration that:

1. Creates the `conversations` table.
2. Adds `conversation_id` (text, FK) and `attachments` (json, default `[]`) to
   `generations`.
3. Backfills: wrap **each existing generation in its own single-turn
   conversation**, with `title` derived from that generation's prompt, and set
   `conversation_id` accordingly.

No media files move.

## A5. IPC + collections

- New conversation IPC channels: `conversations:get-all`, `conversations:create`,
  `conversations:rename`, `conversations:delete`, and a `conversations:changed`
  broadcast (mirroring the existing generations/templates pattern).
- Deleting a conversation cascades to its generations and their media folders.
- `generate:image` / `generate:video` accept an optional `conversationId`. If
  absent, they create a new conversation (title from the prompt) and return its
  id alongside the generation id, so the renderer can stay in that chat.
- New `conversationsCollection` synced collection for the sidebar.
  `generationsCollection` stays; the renderer filters turns by `conversationId`.

## A6. Testing

- Migration backfill: existing generation rows each become exactly one
  conversation; `conversation_id` set; title derived from prompt.
- Model registry: `modelInfo` lookups and `modelKind` derivation for image,
  video, and unknown ids.
- Conversation CRUD: create/rename/delete, and cascade delete removing the
  conversation's generations + media.

## Open follow-ups (Spec B)

- Two-column workspace replacing the chat layout (full replacement).
- Collapsible conversation sidebar ("Open Chats Sidebar" / "New chat").
- Tabbed (Image | Video) model selector with metadata cards.
- Reference-files area, gated by `acceptsReferenceFiles`.
- Template selector showing name + model + prompt preview.
- Output quadrant as a scrollable conversation history feed.
