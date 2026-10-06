#!/usr/bin/env node
// build-data.mjs — Ember yearly electricity CSV -> data/countries.json
//
// Downloads Ember's yearly full release (long format) CSV, streams it line by
// line (the file is ~49MB, never fully loaded into memory), and emits the
// compact per-country bundle defined in
// docs/superpowers/specs/2026-02-06-power-mixdle-design.md.
//
// Usage: node scripts/build-data.mjs
// The CSV is cached in .cache/ (gitignored); delete it to force a re-download.

import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE_DIR = path.join(ROOT, '.cache');
const CSV_PATH = path.join(CACHE_DIR, 'yearly_full_release_long_format.csv');
const OUT_PATH = path.join(ROOT, 'data', 'countries.json');
const CSV_URL =
  'https://storage.googleapis.com/emb-prod-bkt-publicdata/public-downloads/yearly_full_release_long_format.csv';

// Ember CSV Variable name -> spec fuel key (Category='Electricity generation',
// Subcategory='Fuel', Unit='TWh').
const FUEL_MAP = {
  Coal: 'coal',
  Gas: 'gas',
  Nuclear: 'nuclear',
  Hydro: 'hydro',
  Wind: 'wind',
  Solar: 'solar',
  Bioenergy: 'bioenergy',
  'Other Fossil': 'otherFossil',
  'Other Renewables': 'otherRenewables',
};
const FUEL_KEYS = Object.values(FUEL_MAP);

// Coarse region override: Ember's Continent column has no "Middle East", so
// these ISO3 codes (Continent=Asia in the CSV) are remapped. Everything else
// uses the CSV's own Continent value.
const MIDDLE_EAST = new Set([
  'ARE', 'BHR', 'IRN', 'IRQ', 'ISR', 'JOR', 'KWT', 'LBN', 'OMN', 'PSE',
  'QAT', 'SAU', 'SYR', 'TUR', 'YEM',
]);

const MIN_TOTAL_TWH = 1;

async function downloadCsv() {
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`Downloading ${CSV_URL} ...`);
  const res = await fetch(CSV_URL);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  const tmp = `${CSV_PATH}.part`;
  await pipeline(res.body, createWriteStream(tmp));
  const { rename } = await import('node:fs/promises');
  await rename(tmp, CSV_PATH);
  console.log('Download complete.');
}

// Minimal RFC-4180 field parser (handles quoted fields containing commas).
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

const round1 = (n) => Math.round(n * 10) / 10;

async function main() {
  if (!existsSync(CSV_PATH)) {
    await downloadCsv();
  } else {
    console.log(`Using cached CSV at ${path.relative(ROOT, CSV_PATH)}`);
  }

  // countries[iso3] = { name, continent, years: { [year]: { fuels: {}, demand, co2 } } }
  const countries = new Map();

  const rl = createInterface({
    input: createReadStream(CSV_PATH),
    crlfDelay: Infinity,
  });

  let header = null;
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line);
      continue;
    }
    const f = parseCsvLine(line);
    // Columns: Area, ISO 3 code, Year, Area type, Continent, Ember region, EU,
    // OECD, G20, G7, ASEAN, Category, Subcategory, Variable, Unit, Value, ...
    const [area, iso3, year, areaType, continent, , , , , , , category, subcategory, variable, unit, value] = f;
    if (areaType !== 'Country or economy' || !iso3) continue;

    const isGenFuel =
      category === 'Electricity generation' && subcategory === 'Fuel' && unit === 'TWh' && FUEL_MAP[variable];
    const isDemand =
      category === 'Electricity demand' && subcategory === 'Demand' && variable === 'Demand' && unit === 'TWh';
    const isCo2 =
      category === 'Power sector emissions' && subcategory === 'CO2 intensity' && variable === 'CO2 intensity';
    if (!isGenFuel && !isDemand && !isCo2) continue;

    let c = countries.get(iso3);
    if (!c) {
      c = { name: area, continent, years: new Map() };
      countries.set(iso3, c);
    }
    let y = c.years.get(year);
    if (!y) {
      y = { fuels: {}, demand: null, co2: null };
      c.years.set(year, y);
    }
    const num = value === '' ? null : Number(value);
    if (isGenFuel && num !== null) y.fuels[FUEL_MAP[variable]] = num;
    else if (isDemand && num !== null) y.demand = num;
    else if (isCo2 && num !== null) y.co2 = num;
  }

  const out = {};
  let maxYear = 0;
  for (const [iso3, c] of countries) {
    // Latest year with generation data and total >= MIN_TOTAL_TWH.
    // Ember omits zero-value fuel rows (e.g. Australia has no Nuclear row),
    // so missing fuels are treated as 0.
    const years = [...c.years.keys()].map(Number).sort((a, b) => b - a);
    for (const year of years) {
      const y = c.years.get(String(year));
      if (Object.keys(y.fuels).length === 0) continue;
      for (const k of FUEL_KEYS) if (typeof y.fuels[k] !== 'number') y.fuels[k] = 0;
      const total = FUEL_KEYS.reduce((s, k) => s + y.fuels[k], 0);
      if (total < MIN_TOTAL_TWH) continue;

      const mix = {};
      for (const k of FUEL_KEYS) mix[k] = round1((y.fuels[k] / total) * 100);
      const fossilShare = round1(mix.coal + mix.gas + mix.otherFossil);
      const renewablesShare = round1(mix.hydro + mix.wind + mix.solar + mix.bioenergy + mix.otherRenewables);
      const cleanShare = round1(renewablesShare + mix.nuclear);

      out[iso3] = {
        name: c.name,
        iso3,
        year,
        totalTWh: round1(total),
        demandTWh: y.demand !== null ? round1(y.demand) : null,
        mix,
        cleanShare,
        renewablesShare,
        fossilShare,
        co2Intensity: y.co2 !== null ? Math.round(y.co2) : null,
        region: MIDDLE_EAST.has(iso3) ? 'Middle East' : c.continent,
      };
      if (year > maxYear) maxYear = year;
      break; // latest usable year found for this country
    }
  }

  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  const bundle = {
    meta: {
      year: maxYear,
      generatedAt: new Date().toISOString(),
      source: 'Ember yearly electricity data (CC-BY-4.0)',
    },
    countries: sorted,
  };

  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(bundle, null, 2) + '\n');
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}: ${Object.keys(sorted).length} countries, latest year ${maxYear}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
