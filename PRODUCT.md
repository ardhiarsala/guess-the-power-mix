# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Energy-curious casual players (inferred from operator brief: "fun, full of
interactions… educational"): daily-game habitués (Wordle/tradle players) and
people who work in or study energy/climate sharing scores socially. Played on
phone or desktop in short sessions.

## Product Purpose

Power Mixdle is a daily guessing game: guess the mystery country from how
countries generate electricity. Six guesses; each guess shows that country's
generation mix with per-fuel closeness feedback. Success = daily retention,
shared emoji grids, and players leaving knowing more about power systems.

## Positioning

The only tradle-style daily game built on real electricity data (Ember yearly
dataset, 163 countries, CC-BY-4.0): the feedback IS the subject — a country's
power mix rendered as the core game object. Neighboring geography games cannot
truthfully copy the data-derived "Why this mix?" reveal.

## Constraints

- Static zero-build site on GitHub Pages; vanilla ES modules; no JS deps.
- Data pre-baked to `data/countries.json` (Ember API key supplied was invalid;
  public CSV release used instead). No secrets client-side.
- Ember CC-BY-4.0 attribution must remain.
- Game logic contract in `js/game.js` is tested (node --test); visual redesign
  must preserve it and all game behavior.
- Accessibility: keyboard-navigable autocomplete, aria semantics,
  prefers-reduced-motion, contrast ≥ 4.5:1 for body text.

## Brand Commitments

- Operator-pinned aesthetic (2026-02-06, redesign request): **futuristic design
  built from vector shapes and squares**; explicitly NOT "AI slop" and NOT
  Ember's brand design.
