---
owns:
  - sync.js
status: current
---

# Link to tane-data

The app reads the owner's private repo `syoon291/tane-data` through the GitHub Contents API (`sync.js`, pure, fetch passed in, mocked in tests).

## Files

| Path | Written by | The app |
|------|-----------|---------|
| `library/latest.json` | furikaeri `export` (computer) | reads (phase 1) |
| `app/latest.json` | the app | reads and writes the owner's notes with genki's merging sync ([below](#notes-sync)) |

`call()` refuses any URL but the repo itself and the files in `PATHS`. The library is read with the raw media type (works over 1 MB) and `cache: "no-store"`, with a 30 s timeout; redirects are refused, so none can take the token past that list.

## Token

A fine-grained token, resource owner `syoon291`, Repository access: Only select repositories → `tane-data`, Repository permissions → Contents: Read and write (Metadata read-only comes with it). Write access is for the notes sync. `looksLikeToken` accepts only `github_pat_…` (classic tokens cannot be limited to one repo). Linking checks the repo is visible (`checkAccess`) before keeping the token in the `tane-device` database; the token only ever goes into the `Authorization` header, never a message, URL or log. Unlink deletes it; the cached library stays.

## Loading and errors

Reload (Data sheet or welcome card) and a once-a-day automatic reload (`reloadDue`) fetch, validate (`parseLibrary`) and cache the library. Only one reload runs at a time (a second tap joins it), and a reload that was started before a link or unlink drops its result and its error. Errors (`SyncError.code`) and what the owner reads:

| Code | When | Message (gist) |
|------|------|----------------|
| `token` | 401 | GitHub did not accept the token: make a new one |
| `forbidden` | 403 | GitHub refused; the token needs Contents access |
| `repo` | 404 on the repo | The token cannot see tane-data: the repo does not exist yet, or the token lacks access to it |
| `file` | 404 on the file, repo visible | tane-data has no library yet; it appears after the next furikaeri export, then Reload |
| `invalid` | the file fails `parseLibrary` | library/latest.json could not be used: the parser's reason (wrong schema, newer version, …) |
| `network` | offline, timeout | Could not reach GitHub; showing the copy loaded at <time> |

Offline, the app works from the cached copy; a failed reload never removes it.

## Notes sync

The owner's notes, own ideas and tombstones go to `app/latest.json` in the [backup format](data-flow.md#backup) (`mine-store.js` runs it; `sync.js` `mergeSync` holds the GitHub calls; `merge.js` the merge, both pure and unit-tested with a mocked GitHub).

- **When**: about 2.5 s after any change while linked and online; on open when something has not gone out yet (`notesPending`), the last sync failed, or once a local day; when the app is sent to the background or the connection comes back with changes pending; and with **Sync now** (Data sheet "Your notes", or the Mine sync line after an error). One sync at a time; a change during a sync runs one more after it. Never in the demo.
- **How**: check that tane-data is still private (a public repo stops the sync before anything is written), fetch the file (sha from the object media type, which answers over 1 MB too; text with the raw media type), check it with `parseBackup` (a copy this app cannot read, corrupt or from a newer tane, stops the sync with nothing written), merge it with the device's dump record by record, and `PUT` the merged file over exactly the sha it fetched. On a conflict (409, or 422 to a first write when the file exists) it fetches and merges again, up to three times. Commit message `tane sync <ISO time>`. Then the merged copy is applied on the device with `applyChanges`; a record edited meanwhile is left alone and stays pending.
- **Merge** (genki's): a record on one side only is kept; the same id on both sides: the newer `editedAt` wins (a tie keeps this device's). A tombstone at least as new as a record drops it, so a delete on one phone is not undone by another; a record edited after the delete is kept. Tombstones are never pruned. Clocks come from each device.
- **Errors**: the message is kept (`notesSyncError`) and shown on the Mine sync line with Sync now, and in the Data sheet; nothing written on the phone is lost, and the next open retries.
- A fresh phone that links merges into the existing file (nothing is overwritten, both sides are kept), so no confirm is needed.

## Content Security Policy

`index.html` sets `default-src 'self'; script-src 'self'; connect-src 'self' https://api.github.com; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'`. `npm run check` enforces the exact `script-src` and `connect-src`, no inline scripts, handlers or style attributes, and that only `sync.js` names the GitHub API.
