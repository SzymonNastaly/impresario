# Redesign — Spec B: UI Redesign

**Date:** 2026-06-14
**Status:** Approved (design)

Part two of a two-spec app redesign. Builds on Spec A (data foundation:
conversations, model metadata, attachment type). This spec covers the new
workspace layout and components. It assumes Spec A is implemented.

## Goal

Replace the chat-style layout with a two-column workspace that makes model
choice understandable to non-expert users, supports multi-turn conversations,
and provides a reference-files area gated by model capability.

## Non-goals

- No data-model or model-id changes (Spec A).
- No fal wiring of attachments.

## Carryover from Spec A

- The existing per-generation delete handler (`generations:delete`) removes a
  generation + its media but not its (now) parent conversation, which can leave
  an empty conversation row. Spec B's sidebar deletes whole conversations
  (`conversations:delete`, which cascades correctly), so it should own this:
  drop the legacy per-generation delete path, or delete the conversation when
  its last turn is removed.

## B1. Overall layout (full replacement)

Replaces the current output-on-top / prompt-at-bottom layout with a top bar plus
a two-column workspace.

- **Top bar:** `Open Chats Sidebar` (toggle, icon + text) and `New chat`
  (icon + text) buttons.
- **Collapsible conversation sidebar (overlay):** hidden by default. Opening it
  floats it over the left edge with a scrim; the workspace keeps its size and is
  restored to full width on close. Lists conversations (title + last activity),
  with select/delete/rename. `New chat` starts a fresh conversation and focuses
  the text box.
- **Left column:** model selector (top) + reference-files area (bottom).
- **Right column:** template selector (top) → text box (middle) → output feed
  (bottom, tallest).

## B2. Model selector (left-top)

- Image | Video segmented toggle at the top.
- Below it, a scrollable list of model cards for the active kind. Each card:
  label, strength tags (chips), and Speed / Cost hints (e.g. "Fast · $$"),
  sourced from `ModelInfo` (Spec A).
- Selected card is highlighted. Switching kind updates the placeholder/params
  the way `modelKind` does today.

## B3. Reference-files area (left-bottom)

- Drag-and-drop + click-to-add zone with thumbnails and per-file remove buttons.
- **Shown only when the selected model's `acceptsReferenceFiles` is true.**
  Otherwise a muted "This model doesn't accept reference files" state.
- Files are captured into the pending request and persisted onto the resulting
  generation via the Spec A input-storage helper (`media/<id>/input/…`).
- **Not sent to fal** (per Spec A).

## B4. Template selector (right-top)

- Replaces the bare-name dropdown with rows showing **name + model + start of the
  prompt** (prompt preview truncated).
- Selecting a template fills model + prompt + params (and sets/clears reference
  files as applicable).
- "Manage templates…" entry stays.

## B5. Text box (right-middle)

- Today's prompt textarea + Generate button. Enter submits, Shift+Enter inserts a
  newline.
- The model and template selectors move out of the text box into their own
  quadrants (B2, B4).

## B6. Output feed (right-bottom)

- Scrollable conversation history: each turn renders its prompt + result, reusing
  `MediaTile`, progress, and error states from the current `ResultView`.
- Submitting appends a new turn to the active conversation (via `generate:*` with
  the active `conversationId`); the feed scrolls to the new turn.
- **Empty state:** for a brand-new/empty chat, a centered friendly hint
  ("Describe an image or video and press Generate"), similar to today's empty
  `ResultView`.

## Component impact

- `App.tsx`: new grid layout, top bar, overlay sidebar state, active-conversation
  state.
- `Sidebar.tsx`: becomes the overlay conversation list (conversations, not raw
  generations).
- `PromptBar.tsx`: split — text box (B5) stays here or becomes `TextBox`; model
  and template selectors extracted into `ModelSelector` and `TemplateSelector`
  components.
- New `ModelSelector`, `TemplateSelector`, `ReferenceFiles`, and `OutputFeed`
  components.
- `ResultView.tsx` logic for a single generation is reused per-turn inside
  `OutputFeed`.

## Testing

- Model selector: tab switch filters by kind; selecting a card sets the model;
  metadata (tags, speed, cost) render from `ModelInfo`.
- Reference-files area: shown/hidden by `acceptsReferenceFiles`; add/remove files
  updates pending request.
- Template selector: rows show name + model + prompt preview; selecting applies
  the config.
- Output feed: appends a turn on submit; renders prompt + result per turn; empty
  state on a fresh chat.
- Sidebar overlay: toggles open/closed; `New chat` creates and focuses a fresh
  conversation.
