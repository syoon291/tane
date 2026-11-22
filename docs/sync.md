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
| `app/latest.json` | the app | reads and writes with genki's merging sync (phase 2: add it to `PATHS`, build on `readFile`) |

`call()` refuses any URL but the repo itself and the files in `PATHS`. The library is read with the raw media type (works over 1 MB) and `cache: "no-store"`, with a 30 s timeout.

## Token

A fine-grained token, resource owner `syoon291`, Repository access: Only select repositories → `tane-data`, Repository permissions → Contents: Read and write (Metadata read-only comes with it). Write access is for phase 2's notes sync. `looksLikeToken` accepts only `github_pat_…` (classic tokens cannot be limited to one repo). Linking checks the repo is visible (`checkAccess`) before keeping the token in the `tane-device` database; the token only ever goes into the `Authorization` header, never a message, URL or log. Unlink deletes it; the cached library stays.

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

## Content Security Policy

`index.html` sets `default-src 'self'; script-src 'self'; connect-src 'self' https://api.github.com; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'`. `npm run check` enforces the exact `script-src` and `connect-src`, no inline scripts, handlers or style attributes, and that only `sync.js` names the GitHub API.
