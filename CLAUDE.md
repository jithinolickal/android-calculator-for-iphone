# Android Calculator for iPhone

PWA clone of the default Android (Google) Calculator, installable on iPhone via Safari
"Add to Home Screen". Vanilla HTML/CSS/JS, no build step. Deployed free on GitHub Pages.
See `docs/plan.md` for scope (v1 / v2 / v3) and architecture.

## Service worker caching mode

`sw.js` auto-selects its fetch strategy by hostname — **no manual switching before deploy**:

- **Dev** (`localhost` / `127.0.0.1`) → **network-first**: always fetches the latest files
  when online (falls back to cache offline). Edits show up on a normal reload.
- **Production** (e.g. `*.github.io`) → **cache-first**: instant load + full offline. Correct
  mode for a deployed PWA.

Only thing to remember: when assets change in production, bump the `CACHE` version string in
`sw.js` so deployed clients evict the old cache and pick up new files.
