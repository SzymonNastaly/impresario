# Impresario Studio

A local-first desktop app for AI media generation — a ChatGPT-style interface
optimized for images (and, in the future, video and voice). Everything lives on
your device; the app only reaches out to an AI provider (currently
[fal.ai](https://fal.ai)) at generation time. **Bring your own key.**

Built with Electron + electron-vite + React + TypeScript, with
[TanStack AI](https://tanstack.com/ai) for generation, SQLite (better-sqlite3)
for persistence, and [TanStack DB](https://tanstack.com/db) for a reactive UI.

## Architecture

```
┌──────────────────────────── Renderer (React) ────────────────────────────┐
│  PromptBar · ResultView · Sidebar · SettingsModal                         │
│  TanStack DB collection (read-mirror, live queries)                       │
└──────────────▲───────────────────────────────────┬───────────────────────┘
               │ generations:changed (broadcast)    │ window.api.* (IPC)
┌──────────────┴───────────────────────────────────▼───────────────────────┐
│  Main process (Node, trusted)                                             │
│   • SQLite (source of truth)      src/main/db.ts                          │
│   • fal.ai key in OS keychain     src/main/keychain.ts  (safeStorage)     │
│   • generation via TanStack AI    src/main/generate.ts                    │
│   • media blobs on disk + media:// protocol   src/main/storage.ts         │
│   • IPC handlers + lifecycle      src/main/ipc.ts                         │
└───────────────────────────────────────────────────────────────────────────┘
```

Key design decisions:

- **Generation runs in the main process.** The fal.ai API key is stored
  encrypted via Electron `safeStorage` and never enters the renderer.
- **SQLite is the source of truth.** The renderer's TanStack DB collection is a
  reactive mirror: it loads over IPC and re-syncs whenever the main process
  broadcasts `generations:changed`. Writes go through `window.api`, not
  collection mutation handlers.
- **Metadata vs. blobs are split.** Generation metadata lives in SQLite; the
  actual image bytes are written to `userData/media/<id>/` and served to the
  renderer through the privileged `media://` protocol (no filesystem access in
  the renderer).

### Project layout

```
src/
├─ shared/            Types + IPC channel + API contract (all processes)
│  ├─ types.ts
│  └─ api.ts
├─ main/              Node main process
│  ├─ index.ts        Window, protocol registration, bootstrapping
│  ├─ db.ts           better-sqlite3 store + migrations
│  ├─ keychain.ts     safeStorage-backed BYOK key
│  ├─ storage.ts      media files on disk + media:// protocol
│  ├─ generate.ts     fal.ai via @tanstack/ai + @tanstack/ai-fal
│  └─ ipc.ts          IPC handlers + generation lifecycle
├─ preload/           contextBridge → typed window.api
└─ renderer/src/      React UI
   ├─ lib/generations.ts   TanStack DB collection bridged to SQLite
   ├─ components/          Sidebar, PromptBar, ResultView, SettingsModal
   └─ App.tsx
```

## Getting started

```bash
pnpm install      # also rebuilds better-sqlite3 for Electron's ABI (postinstall)
pnpm dev          # run in development with HMR
```

On first launch, open **Settings (⚙)** and paste a fal.ai API key from
<https://fal.ai/dashboard/keys>. Then type a prompt and press **Generate**.

### Scripts

| Command                              | Description                         |
| ------------------------------------ | ----------------------------------- |
| `pnpm dev`                           | Run the app in development with HMR |
| `pnpm build`                         | Typecheck + build all three bundles |
| `pnpm start`                         | Preview the production build        |
| `pnpm typecheck`                     | Typecheck main/preload and renderer |
| `pnpm build:mac` / `:win` / `:linux` | Package a distributable             |

## Notes & gotchas

- **Native module rebuild.** `better-sqlite3` is a native module. The
  `postinstall` script (`electron-builder install-app-deps`) rebuilds it against
  Electron's ABI. If you ever hit a `NODE_MODULE_VERSION` mismatch, run
  `pnpm exec electron-builder install-app-deps`.
- **ESM-only AI packages.** `@tanstack/ai` and `@tanstack/ai-fal` are ESM-only,
  so they're bundled into the (CommonJS) main process via an `exclude` on
  `externalizeDepsPlugin` in `electron.vite.config.ts` rather than externalized.
- **Stored data location** (`userData`): `impresario.db` (SQLite), `media/`
  (image files), `fal.key` (encrypted key). On macOS:
  `~/Library/Application Support/impresario-studio/`.

## Roadmap ideas

- Video generation (`generateVideo`) — reuse the same queued-job lifecycle.
- Voice/speech (`generateSpeech`).
- Per-generation cost/usage display, model parameter controls, image export.
