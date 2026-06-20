# Android Calculator for iPhone — Plan

A pixel-faithful clone of the default Android (Google) Calculator, built as an installable
PWA so it can be added to the iPhone home screen straight from Safari — no Mac, Xcode, or
App Store required. Hosted free on GitHub Pages.

## Goal

The stock iPhone calculator lacks a history tape, live results, and easy expression editing.
The Google Calculator does all of this well. This project recreates its look and core behavior
as a web app that installs and runs like a native app on iOS.

## Scope

### v1 (now)
- Standard keypad: digits, `+ − × ÷`, `=`, `AC`, backspace, `%`, `.`
- **Intelligent parentheses** — one `( )` key that decides whether to insert `(` or `)`
  from context, and auto-inserts `×` (so `16` then `(` becomes `16×(` like the reference)
- **Real-time result** — the answer updates live below the expression as you type
- **History** — a panel of past calculations; tap an entry to reuse its result
- Dark theme matching the reference screenshot (Material You purple/pink palette)
- Installable + offline (PWA manifest + service worker)

### v2 — percentage fix
- Android-style *contextual* percentage: `100 + 10%` = `110`, `100 − 10%` = `90`,
  `100 × 10%` = `10`, `50%` = `0.5`. v1 ships the simple `%` = `÷100`; v2 makes the parser
  look back at the preceding term + operator to match Android.

### v3 — extras
- Scientific panel (sin/cos/log, `^`, `√`, `π`, `e`)
- Light theme + system-aware switching
- Haptic feedback on key press
- True decimal precision via `decimal.js` (fix `0.1 + 0.2`)

## Tech Stack

- **Vanilla HTML / CSS / JavaScript.** No framework, no build step, no bundler.
- Static files served directly by GitHub Pages.
- This keeps the app tiny, instantly offline-capable, and trivial to deploy.

## File Structure

```
android-calculator-for-iphone/
├── index.html        # markup: top bar, display, keypad, history panel, menu
├── styles.css        # themes (CSS vars), layout, history/evaluated states
├── calc.js           # pure calculator logic (math engine + input rules) — unit-tested
├── app.js            # UI layer: state, render, events, history, theme (uses calc.js)
├── manifest.json     # PWA metadata (name, icons, theme color, standalone)
├── sw.js             # service worker — caches app shell for offline use
├── package.json      # dev-only: `npm test` → node's built-in test runner
├── icons/            # app icons (180/192/512 + maskable) for home screen
├── tests/            # node --test specs for calc.js (math + input rules)
│   ├── math.test.js
│   └── input.test.js
└── docs/
    └── plan.md       # this file
```

## Math Engine (no library)

Calculations are done by a small, hand-written evaluator — **not** `eval()` and **not** an
external library. It has two stages:

1. **Tokenizer** — splits the expression string into numbers, operators, and parentheses.
   Display symbols are normalized (`×`→`*`, `÷`→`/`, `−`→`-`).
2. **Parser/evaluator** — a recursive-descent parser that respects operator precedence and
   parentheses, returning a number:

   ```
   expr   := term (('+' | '-') term)*
   term   := factor (('*' | '/') factor)*
   factor := '-'? primary '%'?
   primary:= number | '(' expr ')'
   ```

Why hand-written: full control over the intelligent-parens and percentage behavior, zero
dependencies, and it runs instantly offline.

**Floating-point caveat:** JavaScript uses IEEE-754 doubles, so `0.1 + 0.2` is not exactly
`0.3`. v1 hides this by rounding displayed output to ~12 significant digits and trimming
trailing zeros. If exact decimal math is needed later, swap the number type for `decimal.js`.

## Intelligent Parentheses Logic

A single `( )` key. On press, decide based on the current expression:

- Expression is empty, or last character is an operator or `(` → insert **`(`**
- There is an unclosed `(` **and** the last character is a digit, `)`, or `%` → insert **`)`**
- Otherwise → insert **`(`**
- When inserting `(` directly after a digit, `)`, or `%`, prepend **`×`** (gives `16×(…)`)

## Real-time Result

After every keypress, evaluate the current expression in a `try/catch`. If it produces a
valid number that differs from the raw input, show it in the accent (pink) color below the
expression. On `=`, the result is committed: it moves up as the new expression and the pair
is pushed to history.

## History

- In-memory list of `{ expression, result }`, persisted to `localStorage`.
- Opened via the history icon (top-left) or the expand chevron under the display.
- Tapping an entry inserts its result into the current expression.
- A "Clear" action empties the list.

## Theme (reference palette)

| Token | Use | Color |
|---|---|---|
| Background | app | very dark indigo `#0f0f2e` |
| Number keys | `0–9 . ⌫` | dark indigo `#2b2b4f` |
| Operator keys | `÷ × − + ( ) %` | purple `#4b4ba0` |
| Clear key | `AC` | light periwinkle `#aab4ff` (dark text) |
| Equals key | `=` | pink `#f5a9d6` (dark text) |
| Result preview | live answer | pink `#f0a0d0` |

Keys are circular (`aspect-ratio: 1`), laid out in a 4-column grid.

## PWA / Offline

- `manifest.json` declares name, icons, `display: standalone`, and theme colors so iOS treats
  the home-screen launch as a full-screen app.
- `sw.js` caches the app shell (HTML/CSS/JS/icons) on install so it works with no network.
- iOS meta tags (`apple-mobile-web-app-capable`, status-bar style, `apple-touch-icon`) make
  the standalone launch look native.

## Deployment (GitHub Pages)

1. Push to the `main` branch of the GitHub repo.
2. Repo Settings → Pages → Source: `main` / root.
3. App is served at `https://<user>.github.io/android-calculator-for-iphone/`.
4. On iPhone: open that URL in Safari → Share → **Add to Home Screen**.

Because it's a static site, every push to `main` redeploys automatically.

## Open Questions / Follow-ups

- Home-screen label: using `Calculator` (`short_name`). Repo name stays `android-calculator-iphone`.
- App icon art — generate a simple Material-style calculator glyph in the project palette.
- Confirm contextual `%` is wanted before scientific mode (it changes the parser).
