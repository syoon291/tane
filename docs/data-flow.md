---
owns:
  - db.js
  - backup.js
status: current
---

# Data Flow

## Stores

IndexedDB database `tane` (`db.js`, `DB_VERSION` 1). Upgrades add stores or indexes by bumping the version and adding a step to `UPGRADES`; existing data is never dropped.

| Store | Key | Holds | In a backup | Phase |
|-------|-----|-------|-------------|-------|
| `meta` | `key` | Small app facts `{ key, value }` | no | 1 |
| `library` | `id` | One record `{ id: "current", data, loadedAt, source }`: the last library loaded from tane-data (parsed and normalized) | no (it reloads from tane-data) | 1 |
| `notes` | `id` (index `createdAt`) | `{ id, text, createdAt, editedAt, links: [{ to, kind: "about" \| "agrees" \| "disagrees" \| "builds on" }], context, promptId?, pinned? }` | yes | created now, used in 2 |
| `myIdeas` | `id` | Notes promoted to the owner's own ideas, each keeping a link to its note | yes | created now, used in 2 |
| `days` | `id` (`YYYY-MM-DD`) | The day's idea and whether it was answered | yes | created now, used in 4 |

A separate database, `tane-device` (store `kv`), holds what belongs to this device only: the GitHub token (`githubToken`). It is never part of `dump()` or `replaceAll()`, so it never lands in a backup or a synced file, and an import never overwrites it.

## Where things come from

- **Source** (read-only): tane-data `library/latest.json` → `sync.js` `fetchLibrary` → `library.js` `parseLibrary` → `library` store → `buildIndex` → Explore. A file that fails to parse is never cached; the last good copy stays.
- **Demo**: `demo/library.json` → memory only, while `?demo=1` is in the URL. Never written to any store.
- **Mine** (phase 2): written on the phone into `notes` / `myIdeas` / `days`, synced to tane-data `app/latest.json` (see [sync.md](sync.md)).

## Backup

`backup.js` builds `{ app: "tane", schema: 1, exportedAt, stores: { notes, myIdeas, days } }` from a dump of the owner's stores only (`OWNER_STORES`); anything else handed to it is dropped. `parseBackup` rejects other apps, a newer schema, unknown sections (including `library` and `meta`), non-list sections and records without an `id`. Import (Data sheet, after a `confirm()`) replaces those stores in one transaction: all or nothing. Bump `SCHEMA` with `DB_VERSION` when an owner store changes shape.
