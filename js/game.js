// Pure game logic for Power Mixdle. ESM, no DOM, no fetch.

// Ordered fuel palette — vibrant, accessible on dark backgrounds.
export const FUELS = [
  { key: 'coal', label: 'Coal', color: '#4A4A4A' },
  { key: 'gas', label: 'Gas', color: '#ED8B16' },
  { key: 'nuclear', label: 'Nuclear', color: '#B654C7' },
  { key: 'hydro', label: 'Hydro', color: '#2E86DE' },
  { key: 'wind', label: 'Wind', color: '#26C6DA' },
  { key: 'solar', label: 'Solar', color: '#F7B731' },
  { key: 'bioenergy', label: 'Bioenergy', color: '#6AB04C' },
  { key: 'otherFossil', label: 'Other fossil', color: '#B33939' },
  { key: 'otherRenewables', label: 'Other renewables', color: '#78E08F' },
];

const FUEL_KEYS = FUELS.map((f) => f.key);

// Tuning constant for similarity: 100 - mean(|diff|) * SIMILARITY_K, clamped
// to [0, 100]. k=2 puts a random guess around 40-60 and a strong guess >90.
const SIMILARITY_K = 2;

const TIER_EMOJI = { exact: '🟩', close: '🟨', far: '⬛' };

function mixValue(country, fuelKey) {
  const v = country && country.mix ? country.mix[fuelKey] : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function tierFor(absDiff) {
  if (absDiff <= 3) return 'exact';
  if (absDiff <= 10) return 'close';
  return 'far';
}

export function scoreGuess(target, guess) {
  const perFuel = {};
  let totalAbsDiff = 0;
  for (const key of FUEL_KEYS) {
    const diff = mixValue(target, key) - mixValue(guess, key);
    const absDiff = Math.abs(diff);
    const tier = tierFor(absDiff);
    perFuel[key] = {
      diff,
      tier,
      dir: tier === 'exact' ? 'same' : diff > 0 ? 'up' : 'down',
    };
    totalAbsDiff += absDiff;
  }
  const meanAbsDiff = totalAbsDiff / FUEL_KEYS.length;
  const similarity = Math.max(
    0,
    Math.min(100, Math.round(100 - meanAbsDiff * SIMILARITY_K))
  );
  return { perFuel, similarity };
}

export function pickDailyCountry(iso3List, date) {
  if (!Array.isArray(iso3List) || iso3List.length === 0) return null;
  const d = date instanceof Date ? date : new Date(date);
  const dayNumber = Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000
  );
  if (!Number.isFinite(dayNumber)) return null;
  // Knuth multiplicative hash for good spread across consecutive days.
  const hash = (Math.imul(dayNumber, 2654435761) >>> 0) % iso3List.length;
  return iso3List[hash];
}

export function buildShareGrid(results) {
  const lines = results.map((r) => {
    const row = FUEL_KEYS.map((key) => {
      const tier = r && r.perFuel && r.perFuel[key] ? r.perFuel[key].tier : 'far';
      return TIER_EMOJI[tier];
    }).join('');
    return `${row} ${r.similarity}%`;
  });
  const best = results.reduce((max, r) => Math.max(max, r.similarity), 0);
  lines.push(`Score: ${best}/100`);
  return lines.join('\n');
}

function cleanShareBand(cleanShare) {
  if (typeof cleanShare !== 'number' || !Number.isFinite(cleanShare)) return 'unknown';
  if (cleanShare < 20) return 'under 20%';
  if (cleanShare < 40) return '20–40%';
  if (cleanShare < 60) return '40–60%';
  if (cleanShare < 80) return '60–80%';
  return '80% or more';
}

function demandBand(demandTWh) {
  if (typeof demandTWh !== 'number' || !Number.isFinite(demandTWh)) return 'unknown';
  if (demandTWh < 10) return 'under 10 TWh';
  if (demandTWh < 100) return '10–100 TWh';
  if (demandTWh < 1000) return '100–1000 TWh';
  return '1000 TWh or more';
}

export function getHint(target, guessCount) {
  if (guessCount < 2) return null;
  const hint = { region: target.region };
  if (guessCount >= 4) {
    hint.cleanShareBand = cleanShareBand(target.cleanShare);
    hint.demandBand = demandBand(target.demandTWh);
  }
  return hint;
}

export function checkWin(target, guessIso3) {
  return Boolean(target) && target.iso3 === guessIso3;
}
