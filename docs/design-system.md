---
owns:
  - styles.css
  - icons/**
status: current
---

# Design System

Calm and reading-first, built for a 390px phone in light and dark (`prefers-color-scheme`). One column, max 600px.

## Tokens (`:root`, redefined for dark)

| Token | Use |
|-------|-----|
| `--bg`, `--surface`, `--surface-2`, `--line` | Page, cards, quiet buttons, card edges |
| `--ink`, `--muted` | Text, secondary text (7:1 on every surface) |
| `--accent`, `--accent-ink` | Links, primary buttons, the seed mark |
| `--supports` (green), `--contradicts` (red), `--extends` (cyan) | Link kinds between ideas; always with a text label and a mark shape (square, diamond, circle). `--supports`/`--contradicts` also color good/bad messages |
| `--mine`, `--mine-soft`, `--mine-ink` | The owner's own content and actions only: "Your notes", note and idea cards, the "+" button, the note sheet's top edge, Mine buttons (`--mine-ink` on `--mine`). Never used for source content |
| `--claude`, `--claude-soft`, `--claude-ink` | Claude's take only (perspectives, discussions, the "Replying to" line, the Replies to Claude chip): a blue third voice, with a "Claude · …" label and a sparkle mark (`.claude-mark`), never used for the videos or the owner |
| `--demo-soft` | The demo bar |
| `--serif`, `--sans` | Serif (system: New York / Georgia) for headings, claims, quotes, prompts; sans for UI |

Contrast floors are enforced by `scripts/contrast.mjs` through the fast check (command in docs/docsic.json): ink and muted 7:1 on bg/surface/surface-2, colored text 4.5:1, ink 7:1 on the soft backgrounds. The three voices (`--accent`, `--mine`, `--claude`) keep their hues at least 60° apart in both themes, so they are never confusable. Change lightness, not hue.

## Components

- Rows (`.row`): a full-width link card with a serif title, summary and a muted meta line.
- Breadcrumb (`.crumbs`): wraps, `›` separators, 44px-tall links.
- Video card (`.card.video`), quotes (`.quote`, serif italic with a left rule), prompts (serif cards).
- Link groups (`.link-group.kind-*`): a colored heading with its mark, items with a colored left edge, a direction line and the why.
- Your notes (`.mine-section`): dashed `--mine` border on `--mine-soft`, always after and outside the source block.
- The owner's cards (`.mine-card`): a `--mine` left edge and a "You · <date>" line (`.you`); an own idea (`.mine-card.idea`) on `--mine-soft` with a "Your idea" badge. Their links (`.mine-links`): kind, name, type.
- Claude's take (`.claude-take`): a `<details>` on `--claude-soft` with a solid `--claude` edge (thicker on the left), a summary with the label, a serif "Claude's take" and a chevron; inside, the verdict pill (`.verdict`), take, better version, question and the Reply button (`--mine`, because it writes the owner's note). `.claude-row` for the Discussions rows, `.reply-to` on reply cards, `.chip` / `.chip-claude` for Mine's filters.
- The map (`.map`, `.map-svg`): a `--surface` panel; bubbles (`.bubble`) in an accent tint with an `--accent` edge and a serif label, idea dots (`.dot`, `--accent`), ghosts (`.ghost`, dashed `--muted`), own ideas (`.mine-node`, a `--mine` diamond), the wrote-about dot (`.wrote-mark`); lines `.edge-supports` solid, `.edge-contradicts` dashed, `.edge-extends` dotted, `.edge-mine` dash-dot; the key (`.map-legend`, `.key-*`). The bar above it: `.back-link`, the Map | List segmented control (`.seg`, `.seg-btn[aria-pressed]`), filter chips (`.chip`, `.chip-mine`) and `.folder-pick`. SVG text overrides the global `svg { stroke }` rule.
- Tab bar (`.tabs`), the "+" button (`.fab`, 60px, `--mine`), the toast (`.toast`), the note sheet (`.mine-sheet`, `.note-form`, `.note-links`, `.link-search`).
- Buttons: `.btn` (accent), `.btn.ghost`, `.icon-btn` (44px), `.link-btn`.
- Bottom sheet: `<dialog>` with `.sheet`, safe-area padding.

Safe-area insets pad the header, body sides and sheet bottom; tap targets are at least 44px; body text 17px.

## Icon

A cream seed with one leaf on the accent green (`icons/icon.svg`, rounded; the PNGs are full-bleed squares for iOS and maskable use). `scripts/icons.mjs` draws all of them from one set of shapes, with no dependencies; the header mark in `index.html` uses the same geometry.
