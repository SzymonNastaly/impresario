# Video generation & media actions — design

Date: 2026-06-11

## Goal

Add video generation to Impresario Studio alongside the existing image
generation, and add a set of media actions (save, share, reveal, lightbox)
that apply to both images and videos. The model selector becomes a single
control split into Image and Video sections.

## Decisions (from brainstorming)

- **Cost display: skipped.** fal.ai's API does not return generation cost, and
  the user chose not to maintain a static price table. (This reverses the
  original request; can be revisited with a static estimate table later.)
- **Share: native macOS share sheet**, implemented with Electron's built-in
  `Menu` + `role: 'shareMenu'` + `SharingItem` (file paths). No native module
  or extra dependency.
- **Save: remembered default folder.** A default save directory is stored in
  app settings; `Save` copies there instantly. `Save As…` covers one-off
  locations. The first `Save` with no folder set prompts the user to choose one.
- **Video models: curated mix** (see below); adjustable.

## Key technical facts

- Video generation uses `@tanstack/ai` `generateVideo` / `getVideoJobStatus`
  with the `@tanstack/ai-fal` `falVideo(model, { apiKey })` adapter. It is a
  **job-based, asynchronous** flow:
  1. `generateVideo({ adapter, prompt, ... })` → `{ jobId, model }`
  2. poll `getVideoJobStatus({ adapter, jobId })` →
     `{ status: 'pending'|'processing'|'completed'|'failed', progress?, error? }`
  3. on `completed`, fetch the video URL and download the bytes (provider URLs
     expire, same as images today).
- Image generation stays synchronous (`generateImage`), unchanged.
- Electron `SharingItem` accepts `filePaths`, `texts`, `urls`. A one-item menu
  `[{ role: 'shareMenu', sharingItem: { filePaths: [absPath] } }]` shown with
  `menu.popup()` opens the native sheet. macOS-only; the action is hidden on
  other platforms.

## Data model (`src/shared/types.ts`)

- `GenerationType = 'image' | 'video'`.
- `GenerateVideoRequest { prompt; model?; size?; duration? }`.
- Curated defaults + a kind lookup:
  - `DEFAULT_VIDEO_MODELS`:
    - `fal-ai/veo3/fast` — "Veo 3 Fast"
    - `fal-ai/kling-video/v2/master/text-to-video` — "Kling 2 Master"
    - `fal-ai/minimax/hailuo-02/standard/text-to-video` — "Hailuo 02"
    - `fal-ai/luma-dream-machine` — "Luma Dream Machine"
  - `DEFAULT_VIDEO_MODEL = DEFAULT_VIDEO_MODELS[0].id`.
  - `modelKind(id): 'image' | 'video'` — derived from membership in the two
    default lists (default `'image'`).
- Video job state lives in the existing `params` JSON blob (no DB migration):
  - `params.jobId?: string` — provider job id, set while running.
  - `params.progress?: number` — 0–100, updated during polling.
- Video assets are `.mp4` with `contentType: 'video/mp4'`.
- New IPC channel constants: `generateVideo`, `mediaSave`, `mediaSaveAs`,
  `mediaReveal`, `mediaShare`, `settingsGetSaveDir`, `settingsSetSaveDir`.

## Main process

### `generate.ts`
- Add `RawVideo { bytes: Buffer; contentType: string }`.
- Add `generateVideoAsset(apiKey, req, onProgress)`:
  - builds `falVideo(req.model, { apiKey })`,
  - `generateVideo(...)` to create the job,
  - polls `getVideoJobStatus` on an interval (~2.5s), calling
    `onProgress(jobId, progress)` so the worker can persist/broadcast,
  - throws on `failed`,
  - on `completed`, fetches the URL and downloads bytes (reusing the same
    download/content-type logic as images).

### `ipc.ts`
- `startVideoGeneration(req)`: inserts a `type: 'video'` generation in
  `pending`, fires `runVideoGeneration`, returns `{ id }`.
- `runVideoGeneration(gen, req)`: mirrors `runGeneration` but for the job
  flow — sets `running`, persists `params.jobId` and `params.progress` as
  polling advances (broadcasting on progress change), saves the downloaded
  asset, sets `completed`. Errors set `status: 'error'`.
- **Resume on startup**: `resumeRunningVideos()` finds generations with
  `type: 'video'` and `status` in `pending`/`running` and re-attaches the poll
  loop using the stored `params.jobId` (if a jobId exists; otherwise mark
  errored). Called once after IPC handlers are registered.
- Media handlers:
  - `media:save(generationId, fileName)`: copy the asset into the default save
    folder. If no folder is set, prompt for a directory (and remember it).
    Returns the destination path (or canceled).
  - `media:saveAs(generationId, fileName)`: `dialog.showSaveDialog` with the
    asset's extension; copies bytes to the chosen path.
  - `media:reveal(generationId, fileName)`: `shell.showItemInFolder(absPath)`.
  - `media:share(generationId, fileName)`: build the share menu and
    `menu.popup()`. macOS only.

### `storage.ts`
- Generalize `saveImageAsset` → `saveAsset(generationId, index, bytes,
  contentType)`; extend the extension map with `video/mp4` → `mp4`,
  `video/webm` → `webm`.
- Add `assetAbsolutePath(generationId, fileName): string | null` (constrained
  to the media root, like the protocol handler).
- Add `copyAssetTo(generationId, fileName, destPath)` for save/save-as.

### `settings.ts` (new)
- Minimal JSON store at `userData/settings.json`: `{ saveDir?: string }`.
- `getSaveDir()`, `setSaveDir(dir)`.

## Renderer

### `PromptBar.tsx`
- Single model `Select` with two `SelectGroup`s + `SelectLabel`s: **Image**
  (`DEFAULT_IMAGE_MODELS`) and **Video** (`DEFAULT_VIDEO_MODELS`).
- `submit()` routes by `modelKind(model)`: image → `onGenerateImage`, video →
  `onGenerateVideo`. Placeholder text adapts ("Describe an image…" /
  "Describe a video…").
- Template apply still sets prompt/model/params (templates remain image-only
  for now; selecting a video model is purely manual).

### `ResultView.tsx`
- For `completed` assets, render by `contentType`:
  - image → `<img>` that opens the **Lightbox** on click,
  - video → `<video controls preload="metadata">`.
- Running video shows the `params.progress` percentage next to the spinner.
- Each media tile has a hover toolbar (Save, Share [macOS only], Reveal). The
  buttons call the new `window.api.media.*` methods with
  `(generation.id, asset.fileName)`.

### `Lightbox.tsx` (new)
- Radix `dialog`-based modal that displays a single image at large size for
  inspection. Opened from `ResultView` image clicks. Closes on overlay click /
  Escape.

### `Sidebar.tsx`
- `statusLabel` handles video (`"1 video"` / `"N videos"`); a small icon or
  text hint distinguishes image vs video rows.

### `api.ts` / `preload/index.ts`
- Add `generateVideo(req): Promise<{ id }>`.
- Add `media: { save, saveAs, reveal, share }` (each takes
  `generationId, fileName`).
- Add `settings: { getSaveDir, setSaveDir }`.

## Error handling

- Video job `failed` → generation `status: 'error'` with the provider message.
- Missing/expired URL on completion → error with a clear message.
- Resume on startup with no stored `jobId` → mark the generation errored rather
  than leaving it stuck.
- Save/share/reveal of a missing asset → surfaced error (no crash); path access
  is constrained to the media root.

## Testing

- Manual: generate an image (regression), generate a video end-to-end (poll →
  play), Save / Save As / Reveal / Share each media type, open the lightbox,
  restart mid-video to confirm resume.
- Type/lint: `pnpm typecheck` and `pnpm lint` must pass.

## Out of scope (YAGNI)

Cost display, image-to-video / reference uploads, audio/speech, video editing,
per-model parameter UI, video templates.
