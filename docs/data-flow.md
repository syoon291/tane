---
owns:
  - db.js
  - backup.js
  - merge.js
status: current
---

# Data Flow

## Stores

IndexedDB database `tane` (`db.js`, `DB_VERSION` 2). Upgrades add stores or indexes by bumping the version and adding a step to `UPGRADES`; existing data is never dropped.

| Store | Key | Holds | In a backup | Phase |
|-------|-----|-------|-------------|-------|
| `meta` | `key` | Small app facts `{ key, value }` | no | 1 |
| `library` | `id` | One record `{ id: "current", data, loadedAt, source }`: the last library loaded from tane-data (parsed and normalized) | no (it reloads from tane-data) | 1 |
| `notes` | `id` (index `createdAt`) | The owner's notes: `{ id, text, createdAt, editedAt, links: [{ to, type, kind }], context, promptId?, ideaId? }` ([notes.md](notes.md#records-notesjs-pure)) | yes | 2 |
| `myIdeas` | `id` | Notes made into the owner's own ideas: `{ id, text, fromNote, createdAt, editedAt, links }` | yes | 2 |
| `days` | `id` (`YYYY-MM-DD`) | The day's idea and whether it was answered | yes | created in 1, used in 4 |
| `deleted` | `id` (`<store>:<key as JSON>`) | Tombstones `{ id, store, key, at }`, so a delete travels through sync ([sync.md](sync.md#notes-sync)) | yes | 2 (DB v2) |

Owner records are written only through `putMine` (stamps `editedAt`) and `delMine` (deletes and leaves a tombstone, in one transaction); sync applies its merge with `applyChanges`, which skips any record that changed on the device meanwhile.

A separate database, `tane-device` (store `kv`), holds what belongs to this device only: the GitHub token (`githubToken`) and the notes sync state (`notesSha`, `notesSyncedAt`, `notesSyncError`, `notesPending`). It is never part of `dump()` or `replaceAll()`, so it never lands in a backup or a synced file, and an import never overwrites it.

## Where things come from

- **Source** (read-only): tane-data `library/latest.json` → `sync.js` `fetchLibrary` → `library.js` `parseLibrary` → `library` store → `buildIndex` → Explore. A file that fails to parse is never cached; the last good copy stays.
- **Demo**: `demo/library.json` → memory only, while `?demo=1` is in the URL. Never written to any store.
- **Mine**: written on the phone into `notes` / `myIdeas` (`days` in phase 4), synced to tane-data `app/latest.json` in the backup format (see [sync.md](sync.md#notes-sync)). In the demo, notes stay in memory only.

## Backup

`backup.js` builds `{ app: "tane", schema: 2, exportedAt, stores: { notes, myIdeas, days, deleted } }` from a dump of the owner's stores and tombstones only (`FILE_STORES`); anything else handed to it is dropped. `parseBackup` rejects other apps, a newer schema, unknown sections (including `library` and `meta`), non-list sections and records without an `id`. Schema 1 files (no `deleted`) still import. Import (Data sheet, after a `confirm()`) replaces those stores in one transaction, all or nothing, and resets the tombstones to the file's own, so the device's old deletes never drop imported records; notes only tane-data still has come back on the next sync. Bump `SCHEMA` with `DB_VERSION` when an owner store changes shape.
