# tane

An installable phone web app for exploring the ideas pulled from your saved videos (areas, themes, ideas, and the videos behind them) and, soon, writing your own thoughts next to them. It runs in the browser, on GitHub Pages. This repo holds code and made-up demo data only: your library and notes live in a private data repo and on your phone.

## What it does

- Explore a library of ideas from big areas down to single ideas, with breadcrumbs and the phone's back gesture.
- Read the videos behind each idea: summary, key points, quotes and a link back to the video.
- See how ideas connect (supports, contradicts, builds on), the journaling questions for each, and the threads and core beliefs they belong to.
- Loads the library from a private GitHub repo with a device-only token, and works offline from the last copy.
- Keeps what came from the videos and what you write visibly apart.
- Try it with a made-up demo library, no setup needed.

## Surfaces and stack

- Web app (PWA): plain HTML, CSS and JavaScript modules, IndexedDB storage, a service worker for offline use, hosted on GitHub Pages.

## Next

- [Architecture](docs/architecture.md) - start here, it links every doc
- [Local development](docs/local-dev.md)
- [Deployment](docs/deployment.md)
