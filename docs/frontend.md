---
owns:
  - app.js
  - router.js
  - ui.js
  - explore-view.js
  - map-view.js
  - map-model.js
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
| `#explore/discussions` | Claude's discussions (tensions between ideas) |
| `#explore/discussion/<id>` | One discussion |
| `#mine` | Mine: what the owner wrote ([notes.md](notes.md#mine-tab-mine-viewjs)) |
| `#mine/idea/<id>` | One of the owner's own ideas |

Ids are URI-encoded. Every row and breadcrumb is a real link, so browser back (and the iOS back swipe) moves up through history. An unknown id shows Not found with a link back to Areas.

## Explore

Explore opens on the **map** (`map-view.js` draws it, `map-model.js` decides what is on it); a **Map | List** toggle above the areas, area and theme levels switches to the plain list of the same level (for fast reading and screen readers). The choice is remembered on the device (`localStorage` `tane.exploreView`, read in a try, so a blocked storage just means Map). A **Back** link beside the toggle goes up one level.

### The map

- Hand-written SVG, no library. Each level is one SVG (viewBox 360 wide, scaled to the screen): **Areas** as bubbles sized by idea count (square root, so area follows count); an **area** as its themes, sized the same way; a **theme** as dots for its ideas (sized by videos behind them, the claim cut to two lines under the dot). Ideas from another theme that link to one here join as faded, dashed "ghost" dots ("from another theme"). Tap an area or theme bubble and the map zooms into it (a CSS scale from the tapped point, then the next level scales in; none with reduced motion); tap an idea dot for the idea page.
- Lines are the library's links: supports (green, solid), contradicts (red, dashed), builds on (cyan, dotted), so the kind never relies on color alone; a key under the map names the ones shown. On the areas and area levels the links between their ideas are summed per pair and kind (thicker for more).
- The owner's own ideas are `--mine` diamonds with their words underneath, joined by a dash-dot `--mine` line to what they link to on that level (an idea, or the theme or area holding it; a video or quote counts as its ideas). One linked only to the area or theme on screen sits on its own; one with no links shows on the areas level. Tap opens it in Mine. A small `--mine` dot on a bubble or idea means the owner wrote about it.
- Filters (this visit only): All, I've written about, Not yet touched, My ideas only (chips), and a Folder select (the saved-video folder of the themes; shown when there are two or more). They count and show only matching ideas (an area or theme the owner wrote about directly still shows under the first and last); "Not yet touched" hides own ideas. Nothing left: "Nothing here matches these filters" with Show everything. The list view is never filtered.
- Layout (`layout()` in `map-model.js`): nodes start on a golden-angle spiral, lines pull, a weak pull keeps the map round, overlaps are pushed apart, x stays inside the width. No randomness: the same data always draws the same map.
- Each bubble and dot is an SVG `<a href>` with a full `aria-label` ("Attention and time, 2 themes, 6 ideas, you wrote once about it"); lines are `aria-hidden`. The SVG is `role="group"` labelled "Map of <level>. Tap ... to zoom in."

### Levels (the list view, and the parts around the map)

- **Areas**: name, summary, "N themes · M ideas"; a source line (when the library was loaded, or "Demo library").
- **Area**: its themes with "N ideas · from M videos" (map or list), then Claude's take and Your notes.
- **Theme**: its active ideas (claim, "from N videos") (map or list), then Claude's take and Your notes.
- **Idea**: the claim (and detail when present), then the source block: the videos (title, creator, summary, key points, quotes, "Open in TikTok" with `target="_blank" rel="noopener noreferrer"`), connected ideas grouped by kind (Supports / Contradicts / Builds on, each with a text label, a shaped mark and its color, the direction, and the one-line why), "Write about it" prompts, and "Part of" (core beliefs and threads, a thread's title above its question). Each video and quote has "+ Note", each question "Write". After the source block, a separate "Your notes" section in the `--mine` style: the owner's own ideas and notes linked to this idea (or one of its videos or quotes), newest first, each with "You · <date>" and its kind ("Disagrees with this"), and "Write a note". Area and theme pages show "Your notes" only when something links there.
- **Claude's take**: area, theme and idea pages carry a collapsed `<details>` "Claude's take" (under the title on an idea page; under the map or list on area and theme pages), in the `--claude` style with a "Claude · perspective" label and a sparkle mark, apart from both the videos' block and "Your notes". Opened: the verdict (word, never color alone), the take, "A better version" when there is one, "Claude asks" and Reply (see [notes.md](notes.md#replying-to-claudes-take)); an idea page also lists the discussions it is a side of. An opened take stays open through a background re-render (`data-keep-open`). Pages show no section when Claude has nothing on the item.
- **Discussions**: a `--claude` row under the areas leads to the list; a discussion page shows its sides as regular idea rows ("from the videos"), Claude's take collapsed, Reply, and "Your notes" (replies to it).
- Retired ideas are left out of lists but open by id with a "retired" badge; when their theme is gone the breadcrumb is Areas › idea.

## Breadcrumb

`<nav aria-label="Breadcrumb"><ol>` on every level: Areas › Area › Theme › Idea (a long claim is shortened at a word). Each ancestor is a link; the current page is `aria-current="page"`.

## Accessibility

- Each screen has one `h2` (`tabindex="-1"`, `data-focus`); after a hash change the app scrolls to the top and moves focus to it, so a screen reader reads the new page.
- Lists are real `ul`/`ol`, sections have headings, rows are links, actions are buttons; tap targets are at least 44px.
- Link kinds never rely on color alone (text label and mark shape too; dash pattern on the map).
- The map is never the only way in: List shows the same level as rows, and every map node is a labelled link.
- `#announcer` (polite live region) speaks a finished library load or import.
- A background reload or sync re-renders the view and puts focus back on the same link, button, the map's folder select or the Mine search box (caret kept). Changing a map filter or the view is announced.
- The note sheet is a `<dialog>` with a heading; focus goes to the text box; each link's kind select and remove button are labelled with the linked item's name.

## Data sheet

Library section: when not linked, the token steps and the token form; when linked, last loaded / exported times, the idea count, the last error, Reload and Unlink; in demo mode, Leave the demo. "Your notes" section (linked, not demo): last synced, the last error, Sync now. Backup section: export and import (see [data-flow.md](data-flow.md#backup)). Messages go to a `role="status"` line in the sheet.

## Library choice at boot

1. `?demo=1` in the URL: fetch `demo/library.json`, keep it in memory only.
2. Otherwise the cached record in the `library` store, if any.
3. No library: the welcome card (two owner steps with the exact token settings, "Paste the token", "Look around with demo ideas"); if linked but nothing loaded yet, "Waiting for your library" with the last error and Reload.

When linked, the library reloads by itself once a local day (`reloadDue`) while online.
