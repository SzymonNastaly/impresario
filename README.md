# Impresario Studio

**Impresario Studio is a desktop app for creating images with AI.** It feels
like a chat: you describe the picture you want, press a button, and the app
generates it for you. You can refine your idea over several messages, keep
different projects in separate conversations, and revisit everything you've made
later — all from your own computer.

Your work stays on your device. The app only talks to the AI service when you
ask it to generate something, and you use your own account to do so (see
[Before you start](#before-you-start)).

<!-- Screenshot: the main window with a conversation and generated images -->
<!-- ![Impresario Studio main window](docs/screenshots/main-window.png) -->

## What you can do

- **Generate images from a description.** Type what you want to see and the app
  creates it.
- **Have a conversation.** Keep refining in follow-up messages — ask for
  changes, variations, or a different style.
- **Organize your work.** Each idea lives in its own conversation in the
  sidebar, which you can rename or delete.
- **Use reference images.** Attach your own images to guide a generation.
- **Choose a model.** Pick which AI model to use for the look and quality you
  want.
- **Save templates.** Store prompts you use often and start from them with one
  click.
- **View full-size.** Click any image to open it large.

<!-- Screenshot: choosing a model and a template before generating -->
<!-- ![Choosing a model and template](docs/screenshots/model-and-template.png) -->

## Before you start

Impresario Studio uses [fal.ai](https://fal.ai) to generate images, and you
bring your own key — that means you sign up with fal.ai and the app uses your
account. To get set up:

1. Create a free account at [fal.ai](https://fal.ai).
2. Copy an API key from <https://fal.ai/dashboard/keys>.
3. Open the app, click **Settings (⚙)**, and paste your key.

Your key is stored securely on your computer and is never shared with anyone but
fal.ai.

<!-- Screenshot: the Settings window where you paste your key -->
<!-- ![Settings window](docs/screenshots/settings.png) -->

## How to use it

1. **Start a conversation** — the app opens ready for a new one.
2. **Describe what you want** in the text box at the bottom (for example,
   "a watercolor fox sitting in a snowy forest").
3. *(Optional)* Pick a **model**, attach a **reference image**, or start from a
   **template**.
4. **Press Generate** and wait a few moments for your image to appear.
5. **Keep going** — send another message to refine the result, or start a new
   conversation in the sidebar for a different idea.
6. **Click an image** to view it full-size.

<!-- Screenshot: a refined result after a few follow-up messages -->
<!-- ![Refining a result](docs/screenshots/refining.png) -->

---

The rest of this document is for developers who want to run or modify the app.


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
