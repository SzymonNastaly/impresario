# Video Generation & Media Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fal.ai video generation alongside the existing image generation, a single Image/Video–split model selector, in-app video playback, an image lightbox, and Save / Save As / Reveal / native-macOS-Share actions on every media item.

**Architecture:** Follow the established end-to-end pattern (`shared/types + api → main(generate/ipc/storage/settings) → preload → renderer collection → UI`). Image generation stays synchronous; video uses fal's job-based flow (create → poll status → download bytes) driven by a main-process worker that persists job id + progress into the existing `params` JSON blob (no DB migration). Media file actions and the native share sheet run in the main process via Electron `dialog`, `shell`, and `Menu`+`shareMenu`.

**Tech Stack:** Electron 39, React 19, TypeScript, `@tanstack/ai` + `@tanstack/ai-fal`, Drizzle ORM + better-sqlite3, TanStack DB (reactive mirror), Radix UI / shadcn, Tailwind, lucide-react.

> **Testing note:** This project has **no test runner configured** (verified: no `test` script in `package.json`, and the templates plan documents the same). "Verify" steps use `pnpm typecheck` (node + web), `pnpm lint`, and explicit manual runtime checks via `pnpm dev`. Pure helpers are written in isolation so a runner can cover them later. Commit after each task.

---

## File Structure

**Create:**
- `src/main/settings.ts` — tiny JSON settings store (`userData/settings.json`) holding `saveDir`.
- `src/main/media.ts` — media file actions: resolve absolute path, copy/save/save-as, reveal in Finder, native share sheet.
- `src/renderer/src/components/Lightbox.tsx` — radix-dialog modal showing an image at large size.
- `src/renderer/src/components/MediaTile.tsx` — one image/video tile with hover toolbar (Save/Share/Reveal) + lightbox click.
- `drizzle/<generated>.sql` — only if a migration is emitted (none expected; video state rides in `params`).

**Modify:**
- `src/shared/types.ts` — `GenerationType` union, `GenerateVideoRequest`, video model lists, `modelKind`, new `IPC` channels.
- `src/shared/api.ts` — `generateVideo`, `media`, and `settings.getSaveDir/setSaveDir` on `ImpresarioApi`.
- `src/main/generate.ts` — `generateVideoAsset` (job create + poll + download).
- `src/main/storage.ts` — generalize `saveImageAsset`→`saveAsset`, add video exts, `assetAbsolutePath`, `copyAssetTo`.
- `src/main/ipc.ts` — video worker, resume-on-startup, media + settings handlers.
- `src/main/index.ts` — call `resumeRunningVideos()` after handlers register.
- `src/preload/index.ts` — bridge `generateVideo`, `media`, `settings.*SaveDir`.
- `src/renderer/src/components/PromptBar.tsx` — grouped Image/Video model select + routing.
- `src/renderer/src/components/ResultView.tsx` — render via `MediaTile`, video progress.
- `src/renderer/src/components/Sidebar.tsx` — video-aware status label.
- `src/renderer/src/App.tsx` — `handleGenerate` routes image vs video.
- `src/renderer/src/lib/format.ts` — (no change required; modelLabel reused).

---

## Task 1: Shared types, video models, and IPC channels

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Widen `GenerationType` and add the video request type**

Replace line 4:

```ts
export type GenerationType = 'image' | 'video' // future: 'speech'
```

Add after the `GenerateImageRequest` interface (after line 37):

```ts
export interface GenerateVideoRequest {
  prompt: string
  /** fal video model id, e.g. "fal-ai/veo3/fast". */
  model?: string
  /** Aspect ratio or size hint, provider-dependent (e.g. "16:9"). */
  size?: string
  /** Duration in seconds, if the model supports it. */
  duration?: number
}
```

- [ ] **Step 2: Add the curated video model list, default, and a kind lookup**

After the `DEFAULT_IMAGE_MODEL` line (line 94) add:

```ts
/** A curated default set of fal video models to start with. */
export const DEFAULT_VIDEO_MODELS = [
  { id: 'fal-ai/veo3/fast', label: 'Veo 3 Fast' },
  { id: 'fal-ai/kling-video/v2/master/text-to-video', label: 'Kling 2 Master' },
  { id: 'fal-ai/minimax/hailuo-02/standard/text-to-video', label: 'Hailuo 02' },
  { id: 'fal-ai/luma-dream-machine', label: 'Luma Dream Machine' }
] as const

export const DEFAULT_VIDEO_MODEL = DEFAULT_VIDEO_MODELS[0].id

/** Which generation kind a model id belongs to (defaults to image). */
export function modelKind(id: string): GenerationType {
  return DEFAULT_VIDEO_MODELS.some((m) => m.id === id) ? 'video' : 'image'
}
```

- [ ] **Step 3: Add the new IPC channel names**

Inside the `IPC` object, replace the `generateImage` line and the trailing `// templates` block boundary so the generations section reads:

```ts
  // generations
  generationsGetAll: 'generations:get-all',
  generationsDelete: 'generations:delete',
  generateImage: 'generate:image',
  generateVideo: 'generate:video',
  // main -> renderer broadcast when the store changes
  generationsChanged: 'generations:changed',
  // media file actions
  mediaSave: 'media:save',
  mediaSaveAs: 'media:save-as',
  mediaReveal: 'media:reveal',
  mediaShare: 'media:share',
  // settings: save directory
  settingsGetSaveDir: 'settings:get-save-dir',
  settingsSetSaveDir: 'settings:set-save-dir',
```

Leave the existing `// templates` channels untouched below.

- [ ] **Step 4: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS (no usages yet of the new symbols beyond declarations).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): video generation type, models, and IPC channels"
```

---

## Task 2: Storage — generalize asset saving + path/copy helpers

**Files:**
- Modify: `src/main/storage.ts`

- [ ] **Step 1: Add video content types to the extension map**

Replace the `EXT_BY_CONTENT_TYPE` map (lines 21-27) with:

```ts
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov'
}
```

- [ ] **Step 2: Rename `saveImageAsset` to `saveAsset` (kind-agnostic)**

Replace the `saveImageAsset` function (lines 33-48) with:

```ts
/** Persist one media file to disk and return its metadata (incl. media:// url). */
export function saveAsset(
  generationId: string,
  index: number,
  bytes: Buffer,
  contentType: string
): GenerationAsset {
  mkdirSync(generationDir(generationId), { recursive: true })
  const fileName = `${index}.${extFor(contentType)}`
  writeFileSync(join(generationDir(generationId), fileName), bytes)
  return {
    fileName,
    url: `${MEDIA_SCHEME}://asset/${generationId}/${fileName}`,
    contentType
  }
}
```

- [ ] **Step 3: Add absolute-path resolver and copy helper**

Append before `registerMediaProtocol`:

```ts
/**
 * Resolve an asset's absolute path on disk, constrained to the media root
 * (returns null if it would escape the root or does not exist).
 */
export function assetAbsolutePath(generationId: string, fileName: string): string | null {
  const root = mediaRoot()
  const target = normalize(join(generationDir(generationId), fileName))
  if (!target.startsWith(root + sep)) return null
  return existsSync(target) ? target : null
}

/** Copy a stored asset to an arbitrary destination path. */
export function copyAssetTo(generationId: string, fileName: string, destPath: string): void {
  const src = assetAbsolutePath(generationId, fileName)
  if (!src) throw new Error('Media file not found.')
  copyFileSync(src, destPath)
}
```

Update the import on line 1 to include `copyFileSync`:

```ts
import { mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'fs'
```

- [ ] **Step 4: Update the one existing caller**

In `src/main/ipc.ts` the call `storage.saveImageAsset(...)` will be renamed in Task 4. For now, verify the rename compiles by temporarily expecting a type error there — skip and proceed; Task 4 fixes the caller. (Do not run typecheck until Task 4.)

- [ ] **Step 5: Commit**

```bash
git add src/main/storage.ts
git commit -m "feat(storage): generalize saveAsset and add path/copy helpers"
```

---

## Task 3: Settings store (default save directory)

**Files:**
- Create: `src/main/settings.ts`

- [ ] **Step 1: Write the settings module**

Create `src/main/settings.ts`:

```ts
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// A tiny JSON settings store for non-secret app preferences. Secrets (the fal
// API key) live in the OS keychain instead — see keychain.ts.

interface Settings {
  saveDir?: string
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function read(): Settings {
  const path = settingsPath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Settings
  } catch {
    return {}
  }
}

function write(settings: Settings): void {
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2))
}

export function getSaveDir(): string | null {
  return read().saveDir ?? null
}

export function setSaveDir(dir: string): void {
  write({ ...read(), saveDir: dir })
}
```

- [ ] **Step 2: Verify it compiles in isolation**

Run: `pnpm typecheck:node`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/settings.ts
git commit -m "feat(settings): JSON store for default save directory"
```

---

## Task 4: Video generation in `generate.ts`

**Files:**
- Modify: `src/main/generate.ts`

- [ ] **Step 1: Import the video activities and add a RawVideo type**

Replace line 1-3 imports with:

```ts
import { generateImage, generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { falImage, falVideo } from '@tanstack/ai-fal'
import type { GenerateImageRequest, GenerateVideoRequest } from '@shared/types'
```

Add after the `RawImage` interface (after line 8):

```ts
export interface RawVideo {
  bytes: Buffer
  contentType: string
}
```

- [ ] **Step 2: Add the job-based video generator**

Append to the end of the file:

```ts
const VIDEO_POLL_INTERVAL_MS = 2500

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Drives fal's asynchronous video job: create → poll status → download bytes.
 * `onJob(jobId)` fires once the job id is known (so it can be persisted for
 * resume-on-restart); `onProgress(progress)` fires as polling advances.
 */
export async function generateVideoAsset(
  apiKey: string,
  req: Required<Pick<GenerateVideoRequest, 'model' | 'prompt'>> & GenerateVideoRequest,
  hooks: { onJob?: (jobId: string) => void; onProgress?: (progress: number) => void } = {}
): Promise<RawVideo> {
  const adapter = falVideo(req.model, { apiKey })

  const { jobId } = await generateVideo({
    adapter,
    prompt: req.prompt,
    ...(req.size ? { size: req.size } : {}),
    ...(req.duration ? { duration: req.duration } : {})
  })
  hooks.onJob?.(jobId)

  const url = await pollVideoJob(adapter, jobId, hooks.onProgress)
  return downloadVideo(url)
}

/** Resume polling an already-created job (used after an app restart). */
export async function resumeVideoAsset(
  apiKey: string,
  model: string,
  jobId: string,
  onProgress?: (progress: number) => void
): Promise<RawVideo> {
  const adapter = falVideo(model, { apiKey })
  const url = await pollVideoJob(adapter, jobId, onProgress)
  return downloadVideo(url)
}

async function pollVideoJob(
  adapter: ReturnType<typeof falVideo>,
  jobId: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  for (;;) {
    const status = await getVideoJobStatus({ adapter, jobId })
    if (typeof status.progress === 'number') onProgress?.(status.progress)
    if (status.status === 'completed') {
      const { url } = await adapter.getVideoUrl(jobId)
      if (!url) throw new Error('The model reported completion but returned no video URL.')
      return url
    }
    if (status.status === 'failed') {
      throw new Error(status.error ?? 'Video generation failed.')
    }
    await delay(VIDEO_POLL_INTERVAL_MS)
  }
}

async function downloadVideo(url: string): Promise<RawVideo> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download video (${res.status})`)
  const bytes = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') ?? 'video/mp4'
  return { bytes, contentType }
}
```

- [ ] **Step 3: Verify (expect failure only from the storage rename in ipc.ts)**

Run: `pnpm typecheck:node`
Expected: FAIL only at `src/main/ipc.ts` (`storage.saveImageAsset` no longer exists). `generate.ts` itself compiles. This is fixed in Task 5.

- [ ] **Step 4: Commit**

```bash
git add src/main/generate.ts
git commit -m "feat(generate): job-based fal video generation"
```

---

## Task 5: IPC — video worker, resume, media + settings handlers

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Create: `src/main/media.ts`

- [ ] **Step 1: Create the media-actions module**

Create `src/main/media.ts`:

```ts
import { basename, extname } from 'path'
import { dialog, shell, Menu, BrowserWindow } from 'electron'
import * as storage from './storage'
import * as settings from './settings'

export interface SaveResult {
  canceled: boolean
  path?: string
}

/** Save to the remembered folder; prompt for one the first time. */
export async function saveToDefault(generationId: string, fileName: string): Promise<SaveResult> {
  let dir = settings.getSaveDir()
  if (!dir) {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose a default folder to save media',
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || filePaths.length === 0) return { canceled: true }
    dir = filePaths[0]
    settings.setSaveDir(dir)
  }
  const dest = uniqueDest(dir, fileName)
  storage.copyAssetTo(generationId, fileName, dest)
  return { canceled: false, path: dest }
}

/** Always prompt with a Save-As dialog. */
export async function saveAs(generationId: string, fileName: string): Promise<SaveResult> {
  const ext = extname(fileName).replace('.', '') || 'bin'
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save media',
    defaultPath: fileName,
    filters: [{ name: 'Media', extensions: [ext] }]
  })
  if (canceled || !filePath) return { canceled: true }
  storage.copyAssetTo(generationId, fileName, filePath)
  return { canceled: false, path: filePath }
}

export function reveal(generationId: string, fileName: string): void {
  const path = storage.assetAbsolutePath(generationId, fileName)
  if (!path) throw new Error('Media file not found.')
  shell.showItemInFolder(path)
}

/** Native macOS share sheet via a one-item shareMenu. No-op off macOS. */
export function share(generationId: string, fileName: string): void {
  if (process.platform !== 'darwin') return
  const path = storage.assetAbsolutePath(generationId, fileName)
  if (!path) throw new Error('Media file not found.')
  const menu = Menu.buildFromTemplate([
    { role: 'shareMenu', sharingItem: { filePaths: [path] } }
  ])
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  menu.popup({ window: win ?? undefined })
}

/** Append " (n)" before the extension until the path is free. */
function uniqueDest(dir: string, fileName: string): string {
  const ext = extname(fileName)
  const stem = basename(fileName, ext)
  let candidate = `${dir}/${fileName}`
  let n = 1
  // eslint-disable-next-line no-undef
  const { existsSync } = require('fs') as typeof import('fs')
  while (existsSync(candidate)) {
    candidate = `${dir}/${stem} (${n}).${ext.replace('.', '')}`
    n += 1
  }
  return candidate
}
```

> Note: `existsSync` is imported via `require` inside `uniqueDest` only to keep the top imports tidy; if the project's eslint forbids `require`, hoist `import { existsSync } from 'fs'` to the top instead.

- [ ] **Step 2: Rename the image-save caller and import video helpers in ipc.ts**

In `src/main/ipc.ts`, update the imports block (lines 1-17) to add `Menu`/`shell` are not needed here (media.ts owns them). Change:

```ts
import {
  IPC,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  type Generation,
  type GenerateImageRequest,
  type GenerateVideoRequest,
  type Template,
  type TemplateCreate,
  type TemplateUpdate
} from '@shared/types'
import { serializeTemplate, parseTemplateFile } from '@shared/templates'
import * as db from './db'
import * as keychain from './keychain'
import * as storage from './storage'
import * as settings from './settings'
import * as media from './media'
import { generateImages, generateVideoAsset, resumeVideoAsset } from './generate'
```

In `runGeneration` (line 52-54), rename the asset call:

```ts
    const assets = images.map((img, i) => storage.saveAsset(gen.id, i, img.bytes, img.contentType))
```

- [ ] **Step 3: Add the video worker + starter**

Insert after `startImageGeneration` (after line 92):

```ts
/** Background worker for the asynchronous video job lifecycle. */
async function runVideoGeneration(gen: Generation, req: GenerateVideoRequest): Promise<void> {
  try {
    const apiKey = keychain.getApiKey()
    if (!apiKey) throw new Error('No fal API key set. Add your key in Settings.')

    db.updateGeneration(gen.id, { status: 'running' })
    broadcastGenerationsChanged()

    const video = await generateVideoAsset(
      apiKey,
      { prompt: req.prompt, model: gen.model, size: req.size, duration: req.duration },
      {
        onJob: (jobId) => {
          db.updateGeneration(gen.id, { params: { ...gen.params, jobId } })
          gen.params = { ...gen.params, jobId }
          broadcastGenerationsChanged()
        },
        onProgress: (progress) => {
          db.updateGeneration(gen.id, { params: { ...gen.params, progress } })
          gen.params = { ...gen.params, progress }
          broadcastGenerationsChanged()
        }
      }
    )

    const asset = storage.saveAsset(gen.id, 0, video.bytes, video.contentType)
    db.updateGeneration(gen.id, { status: 'completed', assets: [asset] })
    broadcastGenerationsChanged()
  } catch (err) {
    db.updateGeneration(gen.id, { status: 'error', error: errorMessage(err) })
    broadcastGenerationsChanged()
  }
}

function startVideoGeneration(req: GenerateVideoRequest): { id: string } {
  const prompt = req.prompt?.trim()
  if (!prompt) throw new Error('Prompt is required.')

  const now = Date.now()
  const gen: Generation = {
    id: randomUUID(),
    type: 'video',
    prompt,
    model: req.model || DEFAULT_VIDEO_MODEL,
    status: 'pending',
    params: {
      ...(req.size ? { size: req.size } : {}),
      ...(req.duration ? { duration: req.duration } : {})
    },
    assets: [],
    error: null,
    createdAt: now,
    updatedAt: now
  }

  db.insertGeneration(gen)
  broadcastGenerationsChanged()
  void runVideoGeneration(gen, { ...req, prompt })
  return { id: gen.id }
}

/**
 * Re-attach polling to video jobs left mid-flight by an app restart. A job
 * with a stored jobId resumes; one without is marked errored (unrecoverable).
 */
export function resumeRunningVideos(): void {
  const apiKey = keychain.getApiKey()
  for (const gen of db.getAllGenerations()) {
    if (gen.type !== 'video') continue
    if (gen.status !== 'pending' && gen.status !== 'running') continue
    const jobId = typeof gen.params.jobId === 'string' ? gen.params.jobId : null
    if (!apiKey || !jobId) {
      db.updateGeneration(gen.id, {
        status: 'error',
        error: 'Interrupted before completion. Please generate again.'
      })
      broadcastGenerationsChanged()
      continue
    }
    void resumeOne(gen, apiKey, jobId)
  }
}

async function resumeOne(gen: Generation, apiKey: string, jobId: string): Promise<void> {
  try {
    db.updateGeneration(gen.id, { status: 'running' })
    broadcastGenerationsChanged()
    const video = await resumeVideoAsset(apiKey, gen.model, jobId, (progress) => {
      db.updateGeneration(gen.id, { params: { ...gen.params, progress } })
      gen.params = { ...gen.params, progress }
      broadcastGenerationsChanged()
    })
    const asset = storage.saveAsset(gen.id, 0, video.bytes, video.contentType)
    db.updateGeneration(gen.id, { status: 'completed', assets: [asset] })
    broadcastGenerationsChanged()
  } catch (err) {
    db.updateGeneration(gen.id, { status: 'error', error: errorMessage(err) })
    broadcastGenerationsChanged()
  }
}
```

- [ ] **Step 4: Register the new IPC handlers**

In `registerIpcHandlers`, after the `IPC.generateImage` handler (line 160) add:

```ts
  ipcMain.handle(IPC.generateVideo, (_e, req: GenerateVideoRequest) => startVideoGeneration(req))

  // media file actions
  ipcMain.handle(IPC.mediaSave, (_e, id: string, file: string) => media.saveToDefault(id, file))
  ipcMain.handle(IPC.mediaSaveAs, (_e, id: string, file: string) => media.saveAs(id, file))
  ipcMain.handle(IPC.mediaReveal, (_e, id: string, file: string) => media.reveal(id, file))
  ipcMain.handle(IPC.mediaShare, (_e, id: string, file: string) => media.share(id, file))

  // settings: save directory
  ipcMain.handle(IPC.settingsGetSaveDir, () => settings.getSaveDir())
  ipcMain.handle(IPC.settingsSetSaveDir, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose default save folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || filePaths.length === 0) return settings.getSaveDir()
    settings.setSaveDir(filePaths[0])
    return filePaths[0]
  })
```

- [ ] **Step 5: Call resume on startup**

In `src/main/index.ts`, update the import on line 7 and the ready block (lines 56-58):

```ts
import { registerIpcHandlers, resumeRunningVideos } from './ipc'
```

```ts
  initDb()
  registerMediaProtocol()
  registerIpcHandlers()
  resumeRunningVideos()
```

- [ ] **Step 6: Verify the whole main process compiles**

Run: `pnpm typecheck:node && pnpm lint`
Expected: PASS. If lint flags the `require` in `media.ts`, hoist `import { existsSync } from 'fs'` to the top of `media.ts` and remove the inline `require`.

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc.ts src/main/index.ts src/main/media.ts
git commit -m "feat(ipc): video worker, resume-on-startup, media + settings handlers"
```

---

## Task 6: Preload + API surface

**Files:**
- Modify: `src/shared/api.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Extend the API contract**

In `src/shared/api.ts`, update the import (lines 1-8) to add `GenerateVideoRequest`:

```ts
import type {
  Generation,
  GenerateImageRequest,
  GenerateVideoRequest,
  KeyStatus,
  Template,
  TemplateCreate,
  TemplateUpdate
} from './types'
```

Add to the `settings` block:

```ts
  settings: {
    getKeyStatus(): Promise<KeyStatus>
    setKey(key: string): Promise<KeyStatus>
    clearKey(): Promise<KeyStatus>
    /** The remembered default save folder, or null if unset. */
    getSaveDir(): Promise<string | null>
    /** Prompt for a folder and remember it; returns the chosen (or current) dir. */
    setSaveDir(): Promise<string | null>
  }
```

After `generateImage(req: GenerateImageRequest): Promise<{ id: string }>` add:

```ts
  generateVideo(req: GenerateVideoRequest): Promise<{ id: string }>
  media: {
    /** Save to the remembered folder (prompts for one the first time). */
    save(generationId: string, fileName: string): Promise<{ canceled: boolean; path?: string }>
    /** Always opens a Save-As dialog. */
    saveAs(generationId: string, fileName: string): Promise<{ canceled: boolean; path?: string }>
    reveal(generationId: string, fileName: string): Promise<void>
    /** macOS native share sheet; no-op on other platforms. */
    share(generationId: string, fileName: string): Promise<void>
  }
```

- [ ] **Step 2: Bridge the new methods in preload**

In `src/preload/index.ts`, add to the `settings` object:

```ts
  settings: {
    getKeyStatus: () => ipcRenderer.invoke(IPC.settingsGetKeyStatus),
    setKey: (key) => ipcRenderer.invoke(IPC.settingsSetKey, key),
    clearKey: () => ipcRenderer.invoke(IPC.settingsClearKey),
    getSaveDir: () => ipcRenderer.invoke(IPC.settingsGetSaveDir),
    setSaveDir: () => ipcRenderer.invoke(IPC.settingsSetSaveDir)
  },
```

After the `generateImage` line add:

```ts
  generateVideo: (req) => ipcRenderer.invoke(IPC.generateVideo, req),
  media: {
    save: (id, file) => ipcRenderer.invoke(IPC.mediaSave, id, file),
    saveAs: (id, file) => ipcRenderer.invoke(IPC.mediaSaveAs, id, file),
    reveal: (id, file) => ipcRenderer.invoke(IPC.mediaReveal, id, file),
    share: (id, file) => ipcRenderer.invoke(IPC.mediaShare, id, file)
  },
```

- [ ] **Step 3: Verify both projects compile**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/api.ts src/preload/index.ts
git commit -m "feat(api): expose generateVideo, media actions, and save-dir settings"
```

---

## Task 7: PromptBar — grouped Image/Video model selector + routing

**Files:**
- Modify: `src/renderer/src/components/PromptBar.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Update App's generate handler to route by model kind**

In `src/renderer/src/App.tsx`, replace the import on line 3:

```ts
import { modelKind, type GenerateImageRequest, type GenerateVideoRequest } from '@shared/types'
```

Replace `handleGenerate` (lines 40-43) with:

```ts
  async function handleGenerate(req: GenerateImageRequest | GenerateVideoRequest): Promise<void> {
    const kind = modelKind(req.model ?? '')
    const { id } =
      kind === 'video'
        ? await window.api.generateVideo(req)
        : await window.api.generateImage(req)
    setSelectedId(id)
  }
```

- [ ] **Step 2: Rebuild PromptBar's selector and submit routing**

Replace the contents of `src/renderer/src/components/PromptBar.tsx` with:

```tsx
import { useState } from 'react'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_MODELS,
  DEFAULT_VIDEO_MODELS,
  modelKind,
  type GenerateImageRequest,
  type GenerateVideoRequest,
  type Template
} from '@shared/types'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from './ui/select'

interface PromptBarProps {
  hasKey: boolean
  templates: Template[]
  onGenerate: (req: GenerateImageRequest | GenerateVideoRequest) => Promise<void>
  onNeedKey: () => void
  onManageTemplates: () => void
}

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
  const [params, setParams] = useState<{ numberOfImages?: number; size?: string }>({})

  const kind = modelKind(model)
  const canSubmit = prompt.trim().length > 0

  function onPickTemplate(value: string): void {
    if (value === MANAGE_VALUE) {
      onManageTemplates()
      return
    }
    const tpl = templates.find((t) => t.id === value)
    if (!tpl) return
    setPrompt(tpl.config.prompt)
    setModel(tpl.config.model)
    setParams(tpl.config.params)
  }

  async function submit(): Promise<void> {
    if (!hasKey) {
      onNeedKey()
      return
    }
    if (!canSubmit) return
    const text = prompt.trim()
    setPrompt('')
    setParams({})
    if (modelKind(model) === 'video') {
      await onGenerate({ prompt: text, model })
    } else {
      await onGenerate({ prompt: text, model, ...params })
    }
  }

  return (
    <div className="border-t border-border bg-background px-7 pt-3.5 pb-5">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-input/30 p-2.5 pl-3.5 transition-colors focus-within:border-ring">
        <Textarea
          rows={1}
          placeholder={kind === 'video' ? 'Describe a video to generate…' : 'Describe an image to generate…'}
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
                <SelectGroup>
                  <SelectLabel>Image</SelectLabel>
                  {DEFAULT_IMAGE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Video</SelectLabel>
                  {DEFAULT_VIDEO_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
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

- [ ] **Step 3: Verify**

Run: `pnpm typecheck:web && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/PromptBar.tsx src/renderer/src/App.tsx
git commit -m "feat(promptbar): grouped image/video model selector with kind routing"
```

---

## Task 8: Lightbox component

**Files:**
- Create: `src/renderer/src/components/Lightbox.tsx`

- [ ] **Step 1: Write the Lightbox**

Create `src/renderer/src/components/Lightbox.tsx`:

```tsx
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'

interface LightboxProps {
  src: string | null
  alt: string
  onClose: () => void
}

/** Full-size image inspection modal. Renders nothing when `src` is null. */
export function Lightbox({ src, alt, onClose }: LightboxProps): React.JSX.Element | null {
  if (!src) return null
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[92vw] border-0 bg-transparent p-0 shadow-none sm:max-w-[92vw]">
        <DialogTitle className="sr-only">{alt || 'Image preview'}</DialogTitle>
        <img
          src={src}
          alt={alt}
          className="mx-auto max-h-[88vh] w-auto max-w-full rounded-lg object-contain"
        />
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Lightbox.tsx
git commit -m "feat(lightbox): full-size image inspection modal"
```

---

## Task 9: MediaTile — playback, hover toolbar, lightbox trigger

**Files:**
- Create: `src/renderer/src/components/MediaTile.tsx`

- [ ] **Step 1: Write the MediaTile**

Create `src/renderer/src/components/MediaTile.tsx`:

```tsx
import { useState } from 'react'
import { Download, Share2, FolderOpen, Check } from 'lucide-react'
import type { GenerationAsset } from '@shared/types'
import { Button } from './ui/button'

const isMac = navigator.platform.toUpperCase().includes('MAC')

interface MediaTileProps {
  generationId: string
  asset: GenerationAsset
  alt: string
  onOpenLightbox: (src: string) => void
}

export function MediaTile({
  generationId,
  asset,
  alt,
  onOpenLightbox
}: MediaTileProps): React.JSX.Element {
  const [saved, setSaved] = useState(false)
  const isVideo = asset.contentType.startsWith('video/')

  async function save(): Promise<void> {
    const res = await window.api.media.save(generationId, asset.fileName)
    if (!res.canceled) {
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    }
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-muted">
      {isVideo ? (
        <video src={asset.url} controls preload="metadata" className="block w-full" />
      ) : (
        <img
          src={asset.url}
          alt={alt}
          className="block w-full cursor-zoom-in"
          onClick={() => onOpenLightbox(asset.url)}
        />
      )}

      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="secondary"
          size="icon-xs"
          title={saved ? 'Saved' : 'Save'}
          onClick={() => void save()}
        >
          {saved ? <Check /> : <Download />}
        </Button>
        {isMac && (
          <Button
            variant="secondary"
            size="icon-xs"
            title="Share"
            onClick={() => void window.api.media.share(generationId, asset.fileName)}
          >
            <Share2 />
          </Button>
        )}
        <Button
          variant="secondary"
          size="icon-xs"
          title="Reveal in Finder"
          onClick={() => void window.api.media.reveal(generationId, asset.fileName)}
        >
          <FolderOpen />
        </Button>
      </div>
    </div>
  )
}
```

> Verify `size="icon-xs"` exists on the Button variants (it is already used in `Sidebar.tsx`). `Download`, `Share2`, `FolderOpen`, `Check` are valid lucide-react icons.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck:web && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/MediaTile.tsx
git commit -m "feat(media-tile): playback, save/share/reveal toolbar, lightbox trigger"
```

---

## Task 10: ResultView — use MediaTile, video progress, lightbox state

**Files:**
- Modify: `src/renderer/src/components/ResultView.tsx`

- [ ] **Step 1: Rewrite ResultView**

Replace the contents of `src/renderer/src/components/ResultView.tsx` with:

```tsx
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { Generation } from '@shared/types'
import { modelLabel, relativeTime } from '../lib/format'
import { MediaTile } from './MediaTile'
import { Lightbox } from './Lightbox'

interface ResultViewProps {
  generation: Generation | null
}

export function ResultView({ generation }: ResultViewProps): React.JSX.Element {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  if (!generation) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-7">
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <h2 className="font-heading text-lg font-semibold text-foreground">Impresario Studio</h2>
          <p>Describe an image or video and press Generate to begin.</p>
        </div>
      </div>
    )
  }

  const progress = typeof generation.params.progress === 'number' ? generation.params.progress : null
  const busyLabel =
    generation.status === 'pending'
      ? 'Queued…'
      : generation.type === 'video'
        ? progress !== null
          ? `Generating… ${Math.round(progress)}%`
          : 'Generating video…'
        : 'Generating…'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-7">
      <h1 className="mb-1.5 text-[17px] leading-snug font-medium">{generation.prompt}</h1>
      <div className="mb-5 flex items-center gap-2.5 text-xs text-muted-foreground">
        <span>{modelLabel(generation.model)}</span>
        <span>·</span>
        <span>{relativeTime(generation.createdAt)}</span>
      </div>

      {(generation.status === 'pending' || generation.status === 'running') && (
        <div className="flex items-center gap-2.5 py-8 text-muted-foreground">
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {generation.assets.map((asset) => (
            <MediaTile
              key={asset.fileName}
              generationId={generation.id}
              asset={asset}
              alt={generation.prompt}
              onOpenLightbox={setLightboxSrc}
            />
          ))}
        </div>
      )}

      <Lightbox src={lightboxSrc} alt={generation.prompt} onClose={() => setLightboxSrc(null)} />
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck:web && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ResultView.tsx
git commit -m "feat(result-view): media tiles, video progress, and lightbox"
```

---

## Task 11: Sidebar — video-aware status label

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`

- [ ] **Step 1: Update `statusLabel`**

Replace the `statusLabel` function (lines 88-99) with:

```ts
function statusLabel(gen: Generation): string {
  switch (gen.status) {
    case 'pending':
      return 'Queued'
    case 'running':
      return 'Generating'
    case 'completed': {
      const noun = gen.type === 'video' ? 'video' : 'image'
      return `${gen.assets.length} ${noun}${gen.assets.length === 1 ? '' : 's'}`
    }
    case 'error':
      return 'Failed'
  }
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck:web && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat(sidebar): video-aware status label"
```

---

## Task 12: Full verification + manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS for both node and web projects.

- [ ] **Step 2: Manual smoke test**

Run: `pnpm dev`

Verify each, with a fal API key set in Settings:
1. **Image regression** — pick an Image model, generate; image appears.
2. **Lightbox** — click the image; it opens large; Escape/overlay closes it.
3. **Video** — pick a Video model (e.g. Veo 3 Fast); "Generating… N%" updates; on completion a `<video>` with controls plays.
4. **Sidebar** — completed video row reads "1 video".
5. **Save** — click Save on a tile; first time prompts for a folder, then copies; button flashes a check. A second Save of the same file writes a " (1)" copy.
6. **Save As** *(only exposed via the same default-folder mechanism; verify the underlying `media.saveAs` IPC if a UI control is later added — currently Save uses the default folder)*.
7. **Reveal** — click Reveal; Finder opens with the file selected.
8. **Share** (macOS) — click Share; the native share sheet appears anchored to the window.
9. **Resume** — start a video, quit the app (Cmd-Q) while it is generating, relaunch; the generation resumes polling and completes (or errors cleanly if the job id was lost).

- [ ] **Step 3: Commit any final fixups**

```bash
git add -A
git commit -m "chore: video generation & media actions verification fixups"
```

---

## Notes on coverage vs. spec

- **Cost display** — intentionally omitted (user decision recorded in the spec).
- **Save As** — the `media.saveAs` IPC is implemented and bridged, but the
  `MediaTile` toolbar currently wires only the default-folder Save (per the
  "remembered default folder" decision). Adding a Save-As entry to the toolbar
  later is a one-line `window.api.media.saveAs(...)` call — left out to keep the
  toolbar compact. If you want it surfaced now, add a fourth button in Task 9.
- **Templates** remain image-only; selecting a video model is manual.
