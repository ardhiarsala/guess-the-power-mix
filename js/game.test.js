import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FUELS,
  scoreGuess,
  pickDailyCountry,
  buildShareGrid,
  getHint,
  checkWin,
} from './game.js';

const FUEL_KEYS = [
  'coal',
  'gas',
  'nuclear',
  'hydro',
  'wind',
  'solar',
  'bioenergy',
  'otherFossil',
  'otherRenewables',
];

function makeCountry(overrides = {}) {
  const mix = {};
  for (const key of FUEL_KEYS) mix[key] = 0;
  return {
    name: 'Testland',
    iso3: 'TST',
    year: 2024,
    totalTWh: 100,
    demandTWh: 90,
    mix,
    cleanShare: 50,
    renewablesShare: 30,
    fossilShare: 50,
    co2Intensity: 400,
    region: 'Europe',
    ...overrides,
  };
}

test('FUELS has the 9 spec fuels in order with label and color', () => {
  assert.equal(FUELS.length, 9);
  assert.deepEqual(
    FUELS.map((f) => f.key),
    FUEL_KEYS
  );
  for (const fuel of FUELS) {
    assert.equal(typeof fuel.label, 'string');
    assert.match(fuel.color, /^#[0-9A-Fa-f]{6}$/);
  }
});

test('scoreGuess: exact match gives similarity 100 and all-exact tiers', () => {
  const target = makeCountry({
    mix: { coal: 40, gas: 20, nuclear: 10, hydro: 10, wind: 10, solar: 5, bioenergy: 3, otherFossil: 1, otherRenewables: 1 },
  });
  const guess = makeCountry({ iso3: 'GUE', mix: { ...target.mix } });
  const result = scoreGuess(target, guess);
  assert.equal(result.similarity, 100);
  for (const key of FUEL_KEYS) {
    assert.equal(result.perFuel[key].diff, 0);
    assert.equal(result.perFuel[key].tier, 'exact');
    assert.equal(result.perFuel[key].dir, 'same');
  }
});

test('scoreGuess: tier boundaries at |diff| 3 and 10', () => {
  const target = makeCountry({ mix: { coal: 50 } });
  const at3 = scoreGuess(target, makeCountry({ mix: { coal: 47 } }));
  assert.equal(at3.perFuel.coal.tier, 'exact');
  const at4 = scoreGuess(target, makeCountry({ mix: { coal: 46 } }));
  assert.equal(at4.perFuel.coal.tier, 'close');
  const at10 = scoreGuess(target, makeCountry({ mix: { coal: 40 } }));
  assert.equal(at10.perFuel.coal.tier, 'close');
  const at11 = scoreGuess(target, makeCountry({ mix: { coal: 39 } }));
  assert.equal(at11.perFuel.coal.tier, 'far');
});

test('scoreGuess: diff sign and dir reflect target minus guess', () => {
  const target = makeCountry({ mix: { coal: 50 } });
  const low = scoreGuess(target, makeCountry({ mix: { coal: 20 } }));
  assert.equal(low.perFuel.coal.diff, 30);
  assert.equal(low.perFuel.coal.dir, 'up');
  const high = scoreGuess(target, makeCountry({ mix: { coal: 80 } }));
  assert.equal(high.perFuel.coal.diff, -30);
  assert.equal(high.perFuel.coal.dir, 'down');
});

test('scoreGuess: strong guess scores above 90, random-ish guess lands 40-60', () => {
  const target = makeCountry({
    mix: { coal: 40, gas: 20, nuclear: 10, hydro: 10, wind: 10, solar: 5, bioenergy: 3, otherFossil: 1, otherRenewables: 1 },
  });
  const strong = makeCountry({
    mix: { coal: 38, gas: 21, nuclear: 11, hydro: 9, wind: 10, solar: 6, bioenergy: 3, otherFossil: 1, otherRenewables: 1 },
  });
  assert.ok(scoreGuess(target, strong).similarity > 90);
  // A 100% solar guess vs a coal-heavy target: mean |diff| ~21 -> ~58.
  const randomish = makeCountry({ mix: { solar: 100 } });
  const sim = scoreGuess(target, randomish).similarity;
  assert.ok(sim >= 40 && sim <= 60, `expected 40-60, got ${sim}`);
});

test('scoreGuess: missing or null mix values are treated as 0', () => {
  const target = makeCountry({ mix: { coal: 30, gas: null, nuclear: undefined } });
  const guess = makeCountry({ mix: null });
  const result = scoreGuess(target, guess);
  assert.equal(result.perFuel.coal.diff, 30);
  assert.equal(result.perFuel.gas.diff, 0);
  assert.equal(result.perFuel.nuclear.diff, 0);
  assert.equal(result.perFuel.wind.diff, 0);
  assert.ok(result.similarity >= 0 && result.similarity <= 100);
});

test('scoreGuess: similarity is clamped to [0, 100]', () => {
  const target = makeCountry({ mix: { coal: 100 } });
  const guess = makeCountry({ mix: { solar: 100 } });
  const result = scoreGuess(target, guess);
  assert.ok(result.similarity >= 0);
  assert.ok(result.similarity <= 100);
});

test('pickDailyCountry: same date picks same country, different dates differ', () => {
  const list = ['FRA', 'DEU', 'USA', 'BRA', 'IND', 'CHN', 'AUS', 'ZAF', 'JPN', 'CAN'];
  const date = new Date(Date.UTC(2026, 1, 6));
  assert.equal(pickDailyCountry(list, date), pickDailyCountry(list, date));
  // Noon UTC vs start of day: same UTC day -> same pick.
  assert.equal(
    pickDailyCountry(list, new Date(Date.UTC(2026, 1, 6, 12))),
    pickDailyCountry(list, date)
  );
  const picks = new Set();
  for (let day = 1; day <= 28; day++) {
    picks.add(pickDailyCountry(list, new Date(Date.UTC(2026, 1, day))));
  }
  assert.ok(picks.size > 1, 'expected different picks across dates');
});

test('pickDailyCountry: always returns a member of the list; empty list -> null', () => {
  const list = ['FRA', 'DEU', 'USA'];
  for (let day = 1; day <= 31; day++) {
    const pick = pickDailyCountry(list, new Date(Date.UTC(2026, 0, day)));
    assert.ok(list.includes(pick));
  }
  assert.equal(pickDailyCountry([], new Date()), null);
  assert.equal(pickDailyCountry(list, new Date('garbage')), null);
});

test('buildShareGrid: emoji rows per guess plus a score line', () => {
  const target = makeCountry({ mix: { coal: 50, gas: 50 } });
  const exact = scoreGuess(target, makeCountry({ mix: { coal: 50, gas: 50 } }));
  const off = scoreGuess(target, makeCountry({ mix: { coal: 20, gas: 20 } }));
  const grid = buildShareGrid([exact, off]);
  const lines = grid.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], `🟩🟩🟩🟩🟩🟩🟩🟩🟩 ${exact.similarity}%`);
  const rowEmojis = [...lines[1].split(' ')[0]];
  assert.equal(rowEmojis.length, 9);
  for (const emoji of rowEmojis) {
    assert.ok(['🟩', '🟨', '⬛'].includes(emoji));
  }
  assert.equal(lines[2], 'Score: 100/100');
});

test('buildShareGrid: empty results still returns a score line', () => {
  assert.equal(buildShareGrid([]), 'Score: 0/100');
});

test('getHint: null before 2 guesses, region at 2, bands at 4', () => {
  const target = makeCountry({ region: 'Asia', cleanShare: 87.7, demandTWh: 6.8 });
  assert.equal(getHint(target, 0), null);
  assert.equal(getHint(target, 1), null);
  const at2 = getHint(target, 2);
  assert.deepEqual(at2, { region: 'Asia' });
  const at4 = getHint(target, 4);
  assert.equal(at4.region, 'Asia');
  assert.equal(at4.cleanShareBand, '80% or more');
  assert.equal(at4.demandBand, 'under 10 TWh');
  assert.deepEqual(getHint(target, 5), at4);
});

test('getHint: band boundaries', () => {
  const base = makeCountry();
  assert.equal(getHint({ ...base, cleanShare: 0, demandTWh: 5 }, 4).cleanShareBand, 'under 20%');
  assert.equal(getHint({ ...base, cleanShare: 20 }, 4).cleanShareBand, '20–40%');
  assert.equal(getHint({ ...base, cleanShare: 40 }, 4).cleanShareBand, '40–60%');
  assert.equal(getHint({ ...base, cleanShare: 60 }, 4).cleanShareBand, '60–80%');
  assert.equal(getHint({ ...base, cleanShare: 80 }, 4).cleanShareBand, '80% or more');
  assert.equal(getHint({ ...base, demandTWh: 10 }, 4).demandBand, '10–100 TWh');
  assert.equal(getHint({ ...base, demandTWh: 100 }, 4).demandBand, '100–1000 TWh');
  assert.equal(getHint({ ...base, demandTWh: 1000 }, 4).demandBand, '1000 TWh or more');
});

test('checkWin: matches on iso3 only', () => {
  const target = makeCountry({ iso3: 'FRA' });
  assert.equal(checkWin(target, 'FRA'), true);
  assert.equal(checkWin(target, 'DEU'), false);
  assert.equal(checkWin(target, 'fra'), false);
  assert.equal(checkWin(null, 'FRA'), false);
});
