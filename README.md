# Power Mixdle

A daily guessing game about how countries generate electricity — "tradle but for
power mixes". Guess the mystery country from its electricity generation mix
(coal, gas, nuclear, hydro, wind, solar, bioenergy, other fossil, other
renewables).

## How to play

- A mystery country is picked each day (daily mode), or play unlimited random
  rounds in free play.
- Type a country name and submit a guess — you have **6 guesses**.
- After each guess you see that country's generation mix as a stacked bar, plus
  per-fuel feedback: how close each fuel's share is to the mystery country's,
  and whether the target has more (↑) or less (↓) of it.
- A similarity score (0–100) tells you how close the overall mix is.
- Stuck? Progressive hints unlock after guesses 2 and 4 (region, clean-share
  band, demand size).
- Win or lose, the reveal panel shows the country's full mix, its clean share,
  and its grid CO₂ intensity — learn something about the world's electricity
  systems every day.
- Share your result as an emoji grid; streaks and stats are saved locally.

## Data

All electricity data is from
[Ember's yearly electricity data](https://ember-energy.org/data/yearly-electricity-data/),
licensed [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). The dataset
covers generation by fuel, demand, and power-sector CO₂ intensity for 200+
countries; the game bundle (`data/countries.json`) uses the latest year
available per country and keeps ISO3-coded countries with at least 1 TWh of
annual generation (163 countries).

## Rebuilding the data

Requires Node.js 18+ (uses built-in `fetch`; no dependencies):

```sh
node scripts/build-data.mjs
```

This downloads Ember's yearly full release CSV (~49 MB, cached in the
gitignored `.cache/` directory — delete it to force a fresh download) and
regenerates `data/countries.json`.

## Running / deployment

The site is a zero-build static site (vanilla ES modules, no bundler). Serve
the repo root with any static server, e.g.:

```sh
npx serve .
```

It is deployed via **GitHub Pages** from the `main` branch root (`.nojekyll`
included so Pages serves files as-is).
