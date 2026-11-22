---
owns:
  - notes.js
  - mine-view.js
  - mine-store.js
  - note-sheet.js
  - export.js
status: current
---

# Notes and the Mine tab

What the owner writes (phase 2). It is always kept apart from the source content: its own stores (`notes`, `myIdeas`), its own look (the `--mine` accent and a "You · <date>" line), and its own section on source pages ("Your notes", after and outside the source block). A note only ever *points at* a source item; it never copies its text.

## Records (`notes.js`, pure)

- `notes`: `{ id: "note-…", text, createdAt, editedAt, links, context, promptId?, ideaId? }`
- `myIdeas`: `{ id: "mine-…", text, fromNote, createdAt, editedAt, links }`
- a link: `{ to, type, kind }`, type `area | theme | idea | video | quote | myIdea`, kind `about | agrees | disagrees | builds on` (shown as About / Agrees with / Disagrees with / Builds on). One link per target.
- `context`: where it was written (`{ screen, type?, id? }`); `promptId`: the idea question it answers.
- `editedAt` is stamped by `db.js` on every save (`putMine`); deletes leave tombstones (`delMine`). See [sync.md](sync.md#notes-sync).

A link whose target is gone (a video dropped by a re-export, an own idea deleted) still shows, marked, so the note keeps its meaning. A note on one of an idea's videos or quotes counts as being about that idea.

## The "+" quick note (`note-sheet.js`)

The round `--mine` "+" button (fixed above the tab bar, every screen) opens the note sheet linked to what is on screen (`contextFor`): an area, theme or idea page links to it (`about`); an own idea's page links to it (`builds on`); Areas and Mine start free-standing. Idea pages also have "+ Note" on each video and quote and "Write" beside each question (that note keeps `promptId` and shows the question).

In the sheet: the text, the links (each with a kind select and a remove button; none left = a free-standing thought), "+ Add a link" (search over areas, themes, active ideas and own ideas: `linkTargets`), Save, "Make this an idea" (saves the note and an own idea with its words and links, then opens the idea), and Delete (with `confirm()`). Closing with unsaved text asks first. One tap saves once.

## Mine tab (`mine-view.js`)

- `#mine`: "Your ideas" then "Notes", newest first, each with "You · <date>", its text and its links (tap to jump to the source idea); search over the owner's words and the names of what they link to (`searchMine`; only the results redraw so the box keeps focus); the sync line; Export.
- `#mine/idea/<id>`: an own idea: what it grew from, the note it came from, notes and ideas building on it, Edit, "Write a note on it".
- Mine works without a library loaded (links then read "Not in the library on this device").

## Export (`export.js`)

Export Markdown / Export JSON on Mine: every note and own idea, newest first, with each link's id, type, kind and the current text of its target (`source: true` for library items), the question a note answers, and `fromNote`/`ideaId`. `{ app: "tane-export", v: 1, … }`. For reading on the computer (a later review skill); the app never analyzes anything.

## Store and demo (`mine-store.js`)

Loads `notes` and `myIdeas`, saves through `db.js` (`putMine`, `delMine`), and runs the notes sync. In demo mode (`?demo=1`) notes live in memory only and never reach IndexedDB, a backup or GitHub, so made-up demo links never mix into the owner's real notes.
