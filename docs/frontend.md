---
owns:
  - app.js
  - router.js
  - ui.js
  - explore-view.js
  - data-view.js
status: current
---

# Frontend

Plain ES modules, no framework. `app.js` boots, picks the library, and renders `#view` from the URL hash; screens are HTML strings built by pure functions (`explore-view.js`), so they render under `node --test` too. All library text goes through `esc()`.

## Shell

- Header: the brand (seed mark + "tane", a link to `#explore`) and the Data button, which opens the Data sheet (`data-view.js`, a `<dialog>` bottom sheet).
- Demo bar: shown while the demo library is active ("Demo library · made-up ideas, not yours", Leave demo).
- Tab bar (fixed at the bottom): Explore and Mine, the current one `aria-current="page"`. `router.js` `TABS` lists the tabs that exist; Today joins in phase 4. An unknown tab opens Explore.
- The "+" button (fixed above the tab bar, `--mine`): a quick note linked to what is on screen ([notes.md](notes.md#the--quick-note-note-sheetjs)). A short toast confirms a save or delete (the live region speaks it).

## Routing

| Hash | Screen |
|------|--------|
| `#explore` (or empty) | Areas |
| `#explore/area/<id>` | An area's themes |
| `#explore/theme/<id>` | A theme's ideas |
| `#explore/idea/<id>` | An idea |
| `#mine` | Mine: what the owner wrote ([notes.md](notes.md#mine-tab-mine-viewjs)) |
| `#mine/idea/<id>` | One of the owner's own ideas |

Ids are URI-encoded. Every row and breadcrumb is a real link, so browser back (and the iOS back swipe) moves up through history. An unknown id shows Not found with a link back to Areas.

## Explore

- **Areas**: name, summary, "N themes · M ideas"; a source line (when the library was loaded, or "Demo library").
- **Area**: its themes with "N ideas · from M videos".
- **Theme**: its active ideas (claim, "from N videos").
- **Idea**: the claim (and detail when present), then the source block: the videos (title, creator, summary, key points, quotes, "Open in TikTok" with `target="_blank" rel="noopener noreferrer"`), connected ideas grouped by kind (Supports / Contradicts / Builds on, each with a text label, a shaped mark and its color, the direction, and the one-line why), "Write about it" prompts, and "Part of" (core beliefs and threads, a thread's title above its question). Each video and quote has "+ Note", each question "Write". After the source block, a separate "Your notes" section in the `--mine` style: the owner's own ideas and notes linked to this idea (or one of its videos or quotes), newest first, each with "You · <date>" and its kind ("Disagrees with this"), and "Write a note". Area and theme pages show "Your notes" only when something links there.
- Retired ideas are left out of lists but open by id with a "retired" badge; when their theme is gone the breadcrumb is Areas › idea.

## Breadcrumb

`<nav aria-label="Breadcrumb"><ol>` on every level: Areas › Area › Theme › Idea (a long claim is shortened at a word). Each ancestor is a link; the current page is `aria-current="page"`.

## Accessibility

- Each screen has one `h2` (`tabindex="-1"`, `data-focus`); after a hash change the app scrolls to the top and moves focus to it, so a screen reader reads the new page.
- Lists are real `ul`/`ol`, sections have headings, rows are links, actions are buttons; tap targets are at least 44px.
- Link kinds never rely on color alone (text label and mark shape too).
- `#announcer` (polite live region) speaks a finished library load or import.
- A background reload or sync re-renders the view and puts focus back on the same link, button or the Mine search box (caret kept).
- The note sheet is a `<dialog>` with a heading; focus goes to the text box; each link's kind select and remove button are labelled with the linked item's name.

## Data sheet

Library section: when not linked, the token steps and the token form; when linked, last loaded / exported times, the idea count, the last error, Reload and Unlink; in demo mode, Leave the demo. "Your notes" section (linked, not demo): last synced, the last error, Sync now. Backup section: export and import (see [data-flow.md](data-flow.md#backup)). Messages go to a `role="status"` line in the sheet.

## Library choice at boot

1. `?demo=1` in the URL: fetch `demo/library.json`, keep it in memory only.
2. Otherwise the cached record in the `library` store, if any.
3. No library: the welcome card (two owner steps with the exact token settings, "Paste the token", "Look around with demo ideas"); if linked but nothing loaded yet, "Waiting for your library" with the last error and Reload.

When linked, the library reloads by itself once a local day (`reloadDue`) while online.
