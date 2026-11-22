---
owns:
  - sw.js
  - .github/**
status: current
---

# Deployment

## Hosting

GitHub Pages, source GitHub Actions. The URL is in `docs/docsic.json`. The repo is public; it holds code and made-up demo data only.

## CI and deploy

`.github/workflows/pages.yml` runs on every pull request and on pushes to `main`: unit tests, the fast check, then it stages an explicit list of app files into `_site/` (docs, tests and scripts stay out). Only a push to `main` (or a manual run) deploys, so a merge to `main` is a live deploy. A new root module or folder must join the copy list; the check fails until it does.

## Offline (service worker)

`sw.js` precaches the shell (`SHELL`: every module, `styles.css`, the manifest, icons and `demo/library.json`) and serves same-origin GETs network first with `cache: "no-cache"`, falling back to the cache offline. GitHub API calls are never cached by it: the library's offline copy lives in IndexedDB. Bump `CACHE` when the shell list changes so old caches are cleared (`tane-v2` since phase 2 added the notes modules).

## Owner steps

- Create `syoon291/tane-data` (private) and let furikaeri's export write `library/latest.json`.
- Make the fine-grained token (the app's welcome card lists the exact settings) and paste it into the Data sheet once.
- Add the app to the iPhone home screen.
