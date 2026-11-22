---
owns:
  - index.html
  - manifest.webmanifest
  - package.json
status: current
---

# tane - Architecture

## Overview

tane (種, "seed") is an installable, offline-capable web app (PWA) for a phone, for exploring the ideas extracted from the owner's saved videos: areas > themes > ideas > the videos behind them, with links between ideas, journaling prompts, threads and core beliefs. There is no server, no account and no build step: the repo is the website, served by GitHub Pages. The library is written by furikaeri's `export` on the owner's computer into the private repo `syoon291/tane-data` (`library/latest.json`); the app reads it with a device-only token and caches it in IndexedDB.

Two kinds of content are always kept apart: **source** content (the library, read-only) and **mine** (what the owner writes: notes, own ideas, days; phase 2). They live in different stores, travel differently (the library never enters a backup; the owner's stores never come from the library) and look different (the `--mine` accent and the separate "Your notes" section).

Built so far (phase 1): the app shell, the store, linking to tane-data and loading the library, Explore as a drill-down list with breadcrumbs and idea pages, the made-up demo library, and JSON backup. Next: notes and the Mine tab (phase 2), the interactive map (3), Today (4). The product plan lives in the owner's knowledge hub, not here.

## System Overview

| Surface | Path | Role |
|---------|------|------|
| Page shell | `index.html` | Header (brand, Data button), the demo bar, `<main id="view">`, the polite live region `#announcer`, the Data sheet `<dialog>`, PWA meta tags, the Content Security Policy meta (see [sync.md](sync.md#content-security-policy)) |
| App logic | `app.js`, `router.js`, `ui.js` | Boot, library choice (demo or cached), hash routing, rendering, focus on navigation. See [frontend.md](frontend.md) |
| Explore | `explore-view.js` | The drill-down screens (areas, area, theme, idea) as HTML strings. See [frontend.md](frontend.md#explore) |
| Library | `library.js`, `demo/library.json` | Library schema check, normalization and the index (pure, unit-tested); the made-up demo library. See [library.md](library.md) |
| Link to tane-data | `sync.js`, `data-view.js` | GitHub Contents API reads (pure, mocked in tests); the Data sheet (token, Reload, Unlink, backup). See [sync.md](sync.md) |
| Store and backup | `db.js`, `backup.js` | IndexedDB `tane` (meta, library, notes, myIdeas, days) and the device-only `tane-device` (token); backup build/parse. See [data-flow.md](data-flow.md) |
| Offline | `sw.js` | Service worker: precache the shell, network first. See [deployment.md](deployment.md) |
| Look | `styles.css`, `icons/` | Design tokens (light and dark), components, the seed icon. See [design-system.md](design-system.md) |
| Tooling | `scripts/`, `tests/`, `.github/workflows/pages.yml` | The fast check, contrast floors, icon generator; unit tests; CI and Pages deploy. See [local-dev.md](local-dev.md) |

## Docs index

- [local-dev.md](local-dev.md) - running and testing locally
- [deployment.md](deployment.md) - GitHub Pages, CI, the service worker
- [frontend.md](frontend.md) - shell, routing, Explore screens, accessibility
- [library.md](library.md) - the library file format and the index
- [data-flow.md](data-flow.md) - stores, what travels where, backup
- [sync.md](sync.md) - linking to tane-data, errors, CSP
- [design-system.md](design-system.md) - tokens, type, components, icon
