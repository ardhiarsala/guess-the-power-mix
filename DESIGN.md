# Design — GRID PRINT

<!-- Recorded from the built world (documenter pass, 2026-02-06). -->

## World

A futuristic power-grid control schematic drawn entirely in vector linework and
squares. Deep blueprint-ink ground, paper-white hairlines, safety-yellow signal
color, zero border-radius anywhere. The square is the data encoding: every
country's generation mix renders as a 10×10 waffle mosaic where 1 square = 1%
of generation.

## Tokens

- Ground: `--ink #0b2b4c`; panels `--ink-2 #0e3460` at 55% alpha; hover `--ink-3`.
- Lines: `--line` rgba(233,242,250,.16), `--line-strong` rgba(233,242,250,.42).
- Text: `--paper #e9f2fa`; secondary `--paper-dim #9fb8ce` (tinted from ground hue).
- Signal: `--signal #ffd23f` (primary actions, active mode, focus rings, corner
  ticks, selection). Hot hover `--signal-hot #ffdf6e`.
- Tiers: exact `#3ddc84`, close `#ffd23f`, far `#16385c`. Danger `#ff5c5c`.
- Type: Chakra Petch (display, uppercase, tracked) / system-ui body /
  ui-monospace for numerals, chips, and metadata.
- Fuel palette lives in `js/game.js` `FUELS` and is the only multi-hue element.

## Grammar

- `.frame`: hairline panel + yellow corner registration ticks (top-left,
  bottom-right) via pseudo-elements. Used for search console, guess cards,
  reveal, modal, footer.
- `.waffle`: 10×10 grid, 3px gaps, cells cascade in with ease-out-expo
  (6ms/cell, capped 600ms); largest-remainder allocation in `waffleColors()`.
- `.tier-cell`: 9 square feedback tiles per guess, flip-in.
- Buttons: square, Chakra Petch caps; primary = signal fill + ink text;
  ghost = hairline border. Mode switch = joined-square segmented control.
- Icons: authored inline SVG squares only (logo mark, stats, share, new-game,
  error, close). No emoji in chrome; emoji remain only in the share-grid output.
- Backdrop: blueprint grid (96px/24px) + three outlined `.bg-square` fields.
- Motion: ease-out-expo `cubic-bezier(0.16,1,0.3,1)`; single authored moments
  (waffle cascade, tier flip). `prefers-reduced-motion` disables all.
- Browser surfaces themed: selection, caret, scrollbar, focus-visible.

## Constraints

- Zero-build static site; contracts in `js/game.js` unchanged and tested.
- Do not reintroduce radius, glass, gradients-as-decoration, or emoji icons.
