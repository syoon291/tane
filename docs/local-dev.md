---
owns:
  - scripts/**
  - .claude/test-manifest.json
status: current
---

# Local Development

## Prerequisites

- Any static file server (the manifest's dev server uses Python 3's built-in one).
- Node 22 or newer, for the unit tests and the fast check.

Nothing to install: no packages, no build, no env files.

## Setup

Serve the repo root (the exact command and port are in `.claude/test-manifest.json`). Opening `index.html` from disk does not work: module scripts need an http origin. The service worker registers only over https, so it never runs on localhost.

## Environment Variables

None. The only secret is the owner's GitHub token, pasted into the app on the phone and kept in the browser's `tane-device` database.

## Running

- Open the served root: with no token it shows the welcome card.
- Add `?demo=1` (or tap "Look around with demo ideas") to explore the made-up demo library without a token.
- To test against GitHub without a token, mock `https://api.github.com/**` in the browser test.

## Testing

- `npm test`: unit tests (Node's built-in runner, one file at a time) for the library schema and index, routing, the Explore screens, the GitHub calls (mocked fetch), backup, and the check script.
- `npm run check`: the fast check (`scripts/check.mjs`): every module parses, the manifest is valid, every module and file is precached by `sw.js` and copied by the Pages workflow, the CSP is exact (scripts from this site only; network only to this site and `api.github.com`), only `sync.js` calls GitHub, no inline handlers or styles, the demo library is valid and made up (`@demo` creators and links), nothing token-shaped ships, and the color tokens meet their contrast floors (`scripts/contrast.mjs`).
- Run them one after the other, never in parallel.

## Scripts

- `scripts/check.mjs` - the fast check (above).
- `scripts/contrast.mjs` - contrast floors for the tokens in `styles.css`, used by the check.
- `scripts/icons.mjs` (`npm run icons`) - draws `icons/icon.svg` and the 180/192/512 PNGs with no dependencies. Run after changing the mark.
