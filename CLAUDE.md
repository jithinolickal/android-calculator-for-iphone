# Android Calculator for iPhone

PWA clone of the default Android (Google) Calculator, installable on iPhone via Safari
"Add to Home Screen". Vanilla HTML/CSS/JS, no build step. Deployed free on GitHub Pages.
See `docs/plan.md` for scope (v1 / v2 / v3) and architecture.

## Service worker caching

`sw.js` uses a **network-first** strategy everywhere: when online it always fetches the latest
file (and refreshes the cache); when offline it falls back to the cache. This means content
updates appear on the next launch without any cache-busting — important because iOS standalone
PWAs are unreliable at picking up a new service worker. The cache is only an offline fallback.

`app.js` also calls `registration.update()` and reloads once when a new worker takes over, so
updates apply automatically.

## Versioning — bump on every deploy (NOT automated)

Two version strings are **manual** — update both whenever you deploy a change:

1. **App version** shown in the ⋮ menu — `v1.0.0` in `index.html` (`.menu-version`).
2. **Cache version** — `const CACHE = "calc-vN"` in `sw.js`; bump `N` so old caches are purged
   on the next activate.

Keep them in step with the change you're shipping (e.g. patch bump for a fix). There is no
build step or CI that does this, so it's easy to forget — always check before pushing.

If a deployed change isn't showing in an **installed** iOS PWA, the old service worker is stuck:
clear it once via **Settings → Safari → Advanced → Website Data → delete the site**, then
relaunch. Network-first prevents this going forward.
