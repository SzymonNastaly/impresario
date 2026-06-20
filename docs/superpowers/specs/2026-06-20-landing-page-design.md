# Landing page (GitHub Pages) — design

## Goal
A static landing page for Impresario Studio served via GitHub Pages, presenting
the non-technical part of the README (overview, features, setup, usage) with the
two screenshots, plus a prominent download button.

## Decisions
- **Hosting:** GitHub Pages, source = `main` branch, `/docs` folder.
- **Styling:** [simple.css](https://simplecss.org) via CDN (classless). Minimal
  inline `<style>` only for the hero download button and screenshot centering.
- **Download target:** `https://github.com/SzymonNastaly/impresario/releases/latest`
  (always current; survives version bumps).
- **Platforms:** single "Download for macOS" button + a note that Windows/Linux
  builds are configured but not yet released.

## Files
- `docs/index.html` — the page (single static file, no JS, no build step).
- `docs/icon.png` — favicon + hero logo, copied from `resources/icon.png`.
- Reuses `docs/screenshots/main-window.webp` and `docs/screenshots/settings.webp`
  in place (served at `/screenshots/...`).

## Page structure
1. Hero — icon, title, tagline, primary Download button + platform note + repo link.
2. Main-window screenshot.
3. "What you can do" — feature bullets from README.
4. "Before you start" — fal.ai bring-your-own-key explanation, 3 setup steps, privacy note.
5. Settings screenshot.
6. "How to use it" — numbered steps.
7. Footer — GitHub repo, releases, MIT license, © Szymon Nastaly.

## Out of scope (YAGNI)
No JS, build step, analytics, or OS auto-detection.

## Note
Serving from `/docs` also makes other files in that folder (specs, learnings)
reachable by direct URL — unlinked, but technically public. Accepted.
