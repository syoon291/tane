# tane

Start at `docs/architecture.md` - it indexes every doc. Exact commands (unit tests, the fast check, the dev server) are in `.claude/test-manifest.json`; release facts are in `docs/docsic.json`. Never copy them here.

## Gotchas

- Public repo: code and made-up demo data only. Never put a real idea, video, creator, quote, note or library export in code, `demo/`, test fixtures, commits or PR text. `npm run check` rejects demo videos whose creator or link is not a made-up `@demo` one.
- A merge to `main` is a live deploy (GitHub Pages).
- Source content (the library) is read-only and must always look separate from the owner's own content (`--mine` accent, the "Your notes" section). Never mix the two in one block or one store.
- IndexedDB stores and backup files live on the owner's devices: a store change needs a `DB_VERSION` bump with an upgrade step in `db.js` (and the `SCHEMA` bump in `backup.js` when an owner store changes), never a rename or drop of existing data.
- The GitHub token lives only in the separate `tane-device` database; it must never reach a backup, a synced file, a message or a URL.
- Every new root `.js` module must be added to `sw.js` SHELL and to the Pages workflow's copy list; `npm run check` fails until it is.
- The owner's Mac freezes under heavy parallel load: run `npm test` and `npm run check` one after the other, no watchers, no parallel jobs.
