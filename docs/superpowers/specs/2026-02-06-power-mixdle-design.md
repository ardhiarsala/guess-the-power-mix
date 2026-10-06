# Power Mixdle — Design Spec

Date: 2026-02-06. Status: approved-by-operator (explicit end-to-end build request).

## Intent

A GitHub Pages static web game, "tradle but for power mixes": guess the mystery
country from how countries generate electricity. Fun, highly interactive, modern
design (explicitly NOT Ember's brand design), and educational about electricity
systems. Data: Ember yearly electricity data. Budget: < $10 total build cost.

## Data source decision

Operator-supplied `EMBER_API_KEY` is rejected by `https://api.ember-energy.org/v1`
(403 "Invalid API key" on all auth variants). Fallback: Ember's official public
CSV release (same dataset the API serves):

`https://storage.googleapis.com/emb-prod-bkt-publicdata/public-downloads/yearly_full_release_long_format.csv`

Build script downloads it and emits a compact `data/countries.json`. No API key
ships to the client (required anyway: GitHub Pages is fully static).

## Architecture

Zero-build static site, vanilla ES modules. No framework, no bundler — GitHub
Pages serves the repo root (`.nojekyll`).

```
index.html            UI shell (UI worker)
styles.css            all styling (UI worker)
js/ui.js              DOM, animation, interaction (UI worker)
js/game.js            pure game logic, no DOM (game worker)
js/game.test.js       node --test unit tests (game worker)
js/data.js            tiny loader: fetch('data/countries.json') (game worker)
data/countries.json   generated bundle (data worker)
scripts/build-data.mjs  CSV -> JSON pipeline (data worker)
README.md             how to play, data attribution, rebuild instructions (data worker)
.nojekyll             empty
```

File ownership is disjoint; workers may run in parallel in one cwd.

## Data contract: data/countries.json

```jsonc
{
  "meta": { "year": 2024, "generatedAt": "ISO", "source": "Ember yearly electricity data (CC-BY-4.0)" },
  "countries": {
    "FRA": {
      "name": "France", "iso3": "FRA", "year": 2024,
      "totalTWh": 540.2, "demandTWh": 500.1,
      "mix": { "coal": 0.4, "gas": 5.1, "nuclear": 67.3, "hydro": 10.2,
               "wind": 9.1, "solar": 4.8, "bioenergy": 1.9, "otherFossil": 0.8,
               "otherRenewables": 0.4 },   // % of generation, sum ~100
      "cleanShare": 93.7, "renewablesShare": 26.4, "fossilShare": 6.3,
      "co2Intensity": 32,                  // gCO2e/kWh, may be null
      "region": "Europe"                   // coarse region for hints
    }
  }
}
```

Only countries with plausible data (total generation >= 1 TWh, mix shares
available); target ~150+ countries. Fuel keys fixed, exactly the 9 above.

## Game logic contract: js/game.js (pure, ESM, no DOM)

- `FUELS`: ordered array `{ key, label, color }` — the 9 fuels, display colors.
- `scoreGuess(target, guess)` → `{ perFuel: { <fuelKey>: { diff, tier, dir } }, similarity }`
  - `diff = target.mix[f] - guess.mix[f]` (percentage points)
  - `tier`: `'exact'` |diff|<=3, `'close'` |diff|<=10, else `'far'`
  - `dir`: `'up'|'down'|'same'` (target has more/less; 'same' when exact)
  - `similarity`: 0–100, `100 - mean(|diff|) * k` clamped (k chosen so a random
    guess ~40–60, great guess >90)
- `pickDailyCountry(iso3List, date)` → deterministic iso3 from UTC date seed.
- `buildShareGrid(results)` → tradle-style emoji rows (🟩🟨⬛ per fuel + score).
- `getHint(target, guessCount)` → progressive hints: guess>=2 region; guess>=4
  clean-share band + demand size band.
- `checkWin(target, guessIso3)`.

Tests in js/game.test.js via `node --test` must pass.

## Game flow / UX (js/ui.js + index.html + styles.css)

- Daily mode (seeded) + free play (random). 6 guesses. Autocomplete country
  search input (keyboard navigable). Guess → animated stacked bar of the guessed
  country's mix (per-fuel color, springy width animation), per-fuel tier cells,
  direction arrows, similarity score.
- Progressive hints after guesses 2 and 4. Win: confetti + reveal panel; lose:
  reveal panel. Reveal panel = target's full mix bar, "Why this mix?" facts
  derived from data (top fuel, clean share, CO₂ intensity vs world avg, demand
  context), plus one rotating "grid basics" explainer.
- Share button copies emoji grid + score + streak. Streaks/stats in
  localStorage. Stats modal.
- Educational footer: what each fuel is, data attribution to Ember (CC-BY-4.0),
  link to ember-energy.org. NOT Ember's visual design: own playful dark theme,
  glassmorphism cards, vibrant per-fuel palette, smooth motion, responsive
  mobile-first, reduced-motion media query respected.

## Validation

- `node --test js/game.test.js` passes.
- `node scripts/build-data.mjs` regenerates data/countries.json (documented).
- Site loads from a static server with no console errors; all contracts hold.

## Deployment

GitHub Pages from `main` branch root via `gh api`; verify 200 on the Pages URL.
