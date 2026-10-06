// Power Mixdle UI layer: DOM, animation, interaction. Vanilla ESM.

import {
  FUELS,
  scoreGuess,
  pickDailyCountry,
  buildShareGrid,
  getHint,
  checkWin,
} from './game.js';
import { loadCountries } from './data.js';

const MAX_GUESSES = 6;
const WORLD_AVG_CO2 = 480; // gCO2/kWh, rough world average
const STATS_KEY = 'powermixdle:stats';
const DAILY_KEY = 'powermixdle:daily';

const FUEL_FACTS = {
  coal: 'The dirtiest fuel — burned in steam turbines, it emits about twice the CO₂ of gas per unit of electricity.',
  gas: 'Fast to switch on and off, so gas plants often fill the gaps when wind and sun dip.',
  nuclear: 'Runs day and night with zero operational CO₂ — the backbone of low-carbon grids like France\u2019s.',
  hydro: 'Dams and rivers. The oldest renewable, and a giant battery when reservoirs can store water.',
  wind: 'Turbines on land and sea. Output swings with the weather, so grids pair it with flexible sources.',
  solar: 'Panels peak at midday. The fastest-growing source of new electricity worldwide.',
  bioenergy: 'Burning wood, crops or waste for power. Renewable, but not always low-carbon.',
  otherFossil: 'Mostly oil-fired generation — expensive and polluting, now rare outside islands and emergencies.',
  otherRenewables: 'Geothermal, tidal and other smaller clean sources tapping Earth\u2019s heat and oceans.',
};

const GRID_BASICS = [
  { title: 'Supply must always meet demand', text: 'Grids balance generation and consumption every second. Too much or too little power, and frequency drifts — blackouts follow.' },
  { title: 'Baseload vs. peakers', text: 'Nuclear and coal plants run steadily as "baseload". Fast gas "peaker" plants ramp up for the evening demand spike.' },
  { title: 'The duck curve', text: 'Solar floods grids at noon then vanishes at sunset, forcing other generators to ramp hard each evening — the net-demand curve looks like a duck.' },
  { title: 'Interconnectors share power', text: 'Cables between countries let windy Denmark export to calm Germany. Trade smooths out local weather.' },
  { title: 'Capacity ≠ generation', text: 'A solar farm rated 100 MW only averages ~20 MW (its "capacity factor"). Hydro and nuclear run far closer to full tilt.' },
  { title: 'Hydropower is a battery', text: 'Reservoirs store energy as water. Some grids even pump water uphill at night to release it at peak times.' },
];

const TIER_ARROW = { up: '↑', down: '↓', same: '' };

const $ = (id) => document.getElementById(id);

const els = {
  errorState: $('error-state'),
  errorMessage: $('error-message'),
  retryBtn: $('retry-btn'),
  playArea: $('play-area'),
  input: $('guess-input'),
  guessBtn: $('guess-btn'),
  suggestions: $('suggestions'),
  guessesLeft: $('guesses-left'),
  modeLabel: $('mode-label'),
  hintRow: $('hint-row'),
  guesses: $('guesses'),
  reveal: $('reveal'),
  shareBtn: $('share-btn'),
  newGameBtn: $('new-game-btn'),
  modeDaily: $('mode-daily'),
  modeFree: $('mode-free'),
  statsBtn: $('stats-btn'),
  statsModal: $('stats-modal'),
  statsClose: $('stats-close'),
  toast: $('toast'),
  confetti: $('confetti'),
  fuelFacts: $('fuel-facts'),
};

const reducedMotion =
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- State ----------

let countries = null; // { meta, countries: {iso3: country} }
let countryList = []; // sorted array of country objects
let mode = 'daily'; // 'daily' | 'free'
let target = null;
let results = []; // scoreGuess results, in order
let guessedIso3 = new Set();
let gameOver = false;
let won = false;
let highlightIndex = -1;
let activeSuggestions = [];

// ---------- Stats (localStorage) ----------

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s === 'object') {
        return {
          played: s.played || 0,
          won: s.won || 0,
          streak: s.streak || 0,
          bestStreak: s.bestStreak || 0,
          distribution: s.distribution || {},
        };
      }
    }
  } catch (_) { /* corrupted storage — start fresh */ }
  return { played: 0, won: 0, streak: 0, bestStreak: 0, distribution: {} };
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (_) { /* storage unavailable — stats are best-effort */ }
}

function recordGame(stats, didWin, guessCount) {
  stats.played += 1;
  if (didWin) {
    stats.won += 1;
    stats.streak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    stats.distribution[guessCount] = (stats.distribution[guessCount] || 0) + 1;
  } else {
    stats.streak = 0;
    stats.distribution.fail = (stats.distribution.fail || 0) + 1;
  }
  saveStats(stats);
}

function loadDailyRecord() {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && typeof d === 'object') return d;
    }
  } catch (_) { /* ignore */ }
  return null;
}

function saveDailyRecord(record) {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(record));
  } catch (_) { /* best-effort */ }
}

function todayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

// ---------- Game setup ----------

function startGame(newMode) {
  mode = newMode;
  results = [];
  guessedIso3 = new Set();
  gameOver = false;
  won = false;
  els.guesses.innerHTML = '';
  els.hintRow.innerHTML = '';
  els.reveal.classList.add('hidden');
  els.reveal.innerHTML = '';
  els.shareBtn.classList.add('hidden');
  els.input.value = '';
  els.input.disabled = false;
  els.guessBtn.disabled = false;
  hideSuggestions();

  const iso3List = Object.keys(countries.countries);
  if (mode === 'daily') {
    target = countries.countries[pickDailyCountry(iso3List, new Date())];
    els.modeLabel.textContent = `Daily challenge · ${todayKey()}`;
    els.newGameBtn.classList.add('hidden');
    els.modeDaily.classList.add('active');
    els.modeFree.classList.remove('active');

    const record = loadDailyRecord();
    if (record && record.date === todayKey() && record.finished) {
      // Already played today: restore the finished state.
      gameOver = true;
      won = record.won;
      for (const iso3 of record.guesses || []) {
        const guess = countries.countries[iso3];
        if (guess) {
          results.push(scoreGuess(target, guess));
          guessedIso3.add(iso3);
          renderGuess(guess, results[results.length - 1]);
        }
      }
      renderHints(results.length);
      updateGuessesLeft();
      finishGame(false);
      return;
    }
  } else {
    const pick = iso3List[Math.floor(Math.random() * iso3List.length)];
    target = countries.countries[pick];
    els.modeLabel.textContent = 'Free play · random country';
    els.newGameBtn.classList.remove('hidden');
    els.modeFree.classList.add('active');
    els.modeDaily.classList.remove('active');
  }
  updateGuessesLeft();
}

function updateGuessesLeft() {
  const left = MAX_GUESSES - results.length;
  els.guessesLeft.textContent =
    left === 1 ? '1 guess left' : `${left} guesses left`;
}

// ---------- Autocomplete ----------

function findMatches(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const c of countryList) {
    if (guessedIso3.has(c.iso3)) continue;
    const name = c.name.toLowerCase();
    if (name.startsWith(q)) starts.push(c);
    else if (name.includes(q)) contains.push(c);
    if (starts.length >= 8) break;
  }
  return starts.concat(contains).slice(0, 8);
}

function renderSuggestions(matches) {
  activeSuggestions = matches;
  highlightIndex = matches.length ? 0 : -1;
  els.suggestions.innerHTML = '';
  for (const c of matches) {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.id = `sug-${c.iso3}`;
    li.dataset.iso3 = c.iso3;
    const name = document.createElement('span');
    name.textContent = c.name;
    const iso = document.createElement('span');
    iso.className = 'iso';
    iso.textContent = c.iso3;
    li.append(name, iso);
    li.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep input focus
      submitGuess(c.iso3);
    });
    els.suggestions.appendChild(li);
  }
  const show = matches.length > 0;
  els.suggestions.classList.toggle('hidden', !show);
  els.input.setAttribute('aria-expanded', String(show));
  paintHighlight();
}

function paintHighlight() {
  const items = els.suggestions.querySelectorAll('li');
  items.forEach((li, i) => {
    li.classList.toggle('highlighted', i === highlightIndex);
    li.setAttribute('aria-selected', String(i === highlightIndex));
  });
  const active = items[highlightIndex];
  if (active) {
    active.scrollIntoView({ block: 'nearest' });
    els.input.setAttribute('aria-activedescendant', active.id);
  } else {
    els.input.removeAttribute('aria-activedescendant');
  }
}

function hideSuggestions() {
  activeSuggestions = [];
  highlightIndex = -1;
  els.suggestions.classList.add('hidden');
  els.suggestions.innerHTML = '';
  els.input.setAttribute('aria-expanded', 'false');
  els.input.removeAttribute('aria-activedescendant');
}

function moveHighlight(delta) {
  if (!activeSuggestions.length) return;
  highlightIndex =
    (highlightIndex + delta + activeSuggestions.length) % activeSuggestions.length;
  paintHighlight();
}

function pickSuggestion() {
  if (activeSuggestions.length === 0) return null;
  const idx = highlightIndex >= 0 ? highlightIndex : 0;
  return activeSuggestions[idx];
}

// ---------- Guessing ----------

function submitGuess(iso3) {
  if (gameOver || !target) return;
  const guess = countries.countries[iso3];
  if (!guess || guessedIso3.has(iso3)) return;

  guessedIso3.add(iso3);
  const result = scoreGuess(target, guess);
  results.push(result);
  renderGuess(guess, result);
  renderHints(results.length);
  updateGuessesLeft();
  els.input.value = '';
  hideSuggestions();
  els.input.focus();

  if (checkWin(target, iso3)) {
    won = true;
    gameOver = true;
    finishGame(true);
  } else if (results.length >= MAX_GUESSES) {
    won = false;
    gameOver = true;
    finishGame(true);
  }
}

function tryGuessFromInput() {
  if (gameOver) return;
  const picked = pickSuggestion();
  if (picked) {
    submitGuess(picked.iso3);
    return;
  }
  const q = els.input.value.trim().toLowerCase();
  if (!q) return;
  const exact = countryList.find(
    (c) => c.name.toLowerCase() === q && !guessedIso3.has(c.iso3)
  );
  if (exact) {
    submitGuess(exact.iso3);
  } else {
    showToast('No matching country — pick one from the list');
  }
}

// ---------- Rendering ----------

function mixSegments(country) {
  // Fuel segments with a visible share, sorted in FUELS order.
  return FUELS.map((f) => ({
    ...f,
    value: country.mix && typeof country.mix[f.key] === 'number' ? country.mix[f.key] : 0,
  })).filter((s) => s.value > 0.05);
}

// Allocate 100 waffle cells across fuels by largest remainder.
function waffleColors(country) {
  const segs = mixSegments(country);
  const total = segs.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return [];
  const exact = segs.map((s) => (s.value / total) * 100);
  const counts = exact.map((v) => Math.floor(v));
  let remaining = 100 - counts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem);
  for (let k = 0; remaining > 0 && order.length > 0; k = (k + 1) % order.length) {
    counts[order[k].i] += 1;
    remaining -= 1;
  }
  const colors = [];
  segs.forEach((s, i) => {
    for (let j = 0; j < counts[i]; j++) colors.push(s.color);
  });
  return colors;
}

function buildMixBar(country, animate) {
  // GRID PRINT: the mix renders as a 10×10 waffle of squares; 1 square = 1%.
  const waffle = document.createElement('div');
  waffle.className = 'waffle';
  waffle.setAttribute('role', 'img');
  waffle.setAttribute(
    'aria-label',
    `${country.name} electricity mix: ${mixSegments(country)
      .map((s) => `${s.label} ${s.value.toFixed(1)}%`)
      .join(', ')}`
  );
  const colors = waffleColors(country);
  const cells = [];
  for (let i = 0; i < 100; i++) {
    const cell = document.createElement('div');
    cell.className = 'waffle-cell';
    if (colors[i]) cell.style.background = colors[i];
    waffle.appendChild(cell);
    cells.push(cell);
  }
  if (animate && !reducedMotion) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cells.forEach((cell, i) => {
          cell.style.transitionDelay = `${Math.min(i * 6, 600)}ms`;
          cell.classList.add('on');
        });
      });
    });
  } else {
    for (const cell of cells) cell.classList.add('on');
  }
  return waffle;
}

function buildLegend(country) {
  const legend = document.createElement('div');
  legend.className = 'mix-legend';
  for (const s of mixSegments(country)) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = s.color;
    const text = document.createElement('span');
    text.textContent = `${s.label} ${s.value.toFixed(1)}%`;
    item.append(dot, text);
    legend.appendChild(item);
  }
  return legend;
}

function renderGuess(guess, result) {
  const card = document.createElement('article');
  card.className = 'frame guess-card';

  const head = document.createElement('div');
  head.className = 'guess-head';
  const name = document.createElement('span');
  name.className = 'guess-name';
  name.textContent = guess.name;
  const sim = document.createElement('span');
  sim.className = 'similarity';
  sim.classList.add(result.similarity >= 75 ? 'high' : result.similarity >= 50 ? 'mid' : 'low');
  sim.textContent = `${result.similarity}% match`;
  sim.title = 'Overall similarity of this mix to the mystery country';
  head.append(name, sim);
  card.appendChild(head);

  card.appendChild(buildMixBar(guess, true));
  card.appendChild(buildLegend(guess));

  const tierRow = document.createElement('div');
  tierRow.className = 'tier-row';
  FUELS.forEach((f, i) => {
    const info = result.perFuel[f.key];
    const cell = document.createElement('div');
    cell.className = `tier-cell ${info.tier}`;
    cell.style.animationDelay = reducedMotion ? '0s' : `${i * 60}ms`;
    cell.textContent = TIER_ARROW[info.dir];
    const diffAbs = Math.abs(info.diff).toFixed(1);
    const dirText =
      info.dir === 'same'
        ? 'spot on'
        : info.dir === 'up'
          ? `target has ${diffAbs} pts more`
          : `target has ${diffAbs} pts less`;
    cell.title = `${f.label}: ${dirText} (${info.tier})`;
    cell.setAttribute('aria-label', `${f.label}: ${info.tier}, ${dirText}`);
    tierRow.appendChild(cell);
  });
  card.appendChild(tierRow);

  els.guesses.appendChild(card);
  card.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
}

function renderHints(guessCount) {
  const hint = getHint(target, guessCount);
  if (!hint) return;
  els.hintRow.innerHTML = '';
  const chips = [];
  if (hint.region) chips.push(`Region — ${hint.region}`);
  if (hint.cleanShareBand) chips.push(`Clean share — ${hint.cleanShareBand}`);
  if (hint.demandBand) chips.push(`Demand — ${hint.demandBand}`);
  for (const text of chips) {
    const chip = document.createElement('span');
    chip.className = 'hint-chip';
    chip.textContent = text;
    els.hintRow.appendChild(chip);
  }
}

function topFuel(country) {
  let best = null;
  for (const f of FUELS) {
    const v = country.mix && typeof country.mix[f.key] === 'number' ? country.mix[f.key] : 0;
    if (!best || v > best.value) best = { ...f, value: v };
  }
  return best;
}

function buildFacts(country) {
  const facts = [];
  const top = topFuel(country);
  if (top) {
    facts.push(`${country.name}'s biggest source is ${top.label.toLowerCase()} at ${top.value.toFixed(1)}% of generation.`);
  }
  if (typeof country.cleanShare === 'number') {
    facts.push(
      `${country.cleanShare.toFixed(1)}% of its electricity is clean (renewables + nuclear).`
    );
  }
  if (typeof country.co2Intensity === 'number') {
    const rel =
      country.co2Intensity < WORLD_AVG_CO2 * 0.8
        ? 'well below'
        : country.co2Intensity > WORLD_AVG_CO2 * 1.2
          ? 'well above'
          : 'close to';
    facts.push(
      `Its grid emits about ${Math.round(country.co2Intensity)} gCO₂/kWh — ${rel} the world average of ~${WORLD_AVG_CO2}.`
    );
  }
  if (typeof country.demandTWh === 'number') {
    const size =
      country.demandTWh < 10
        ? 'a very small grid'
        : country.demandTWh < 100
          ? 'a mid-sized grid'
          : country.demandTWh < 1000
            ? 'a large grid'
            : 'one of the world\u2019s biggest grids';
    facts.push(
      `It uses about ${country.demandTWh.toFixed(0)} TWh of electricity a year — ${size}.`
    );
  }
  return facts;
}

function renderReveal() {
  const stats = loadStats();
  const basics = GRID_BASICS[stats.played % GRID_BASICS.length];

  const card = document.createElement('section');
  card.className = `frame reveal-card ${won ? 'win' : 'lose'}`;

  const title = document.createElement('h2');
  title.textContent = won
    ? `Solved in ${results.length} ${results.length === 1 ? 'guess' : 'guesses'}`
    : 'Out of guesses';
  const sub = document.createElement('p');
  sub.className = 'reveal-sub';
  sub.textContent = `The mystery country was ${target.name}.`;
  card.append(title, sub);

  card.appendChild(buildMixBar(target, true));
  card.appendChild(buildLegend(target));

  const factsTitle = document.createElement('h3');
  factsTitle.textContent = 'Why this mix?';
  factsTitle.style.margin = '1rem 0 0.4rem';
  factsTitle.style.fontSize = '0.95rem';
  factsTitle.style.color = 'var(--paper-dim)';
  card.appendChild(factsTitle);

  const list = document.createElement('ul');
  list.className = 'facts-list';
  for (const fact of buildFacts(target)) {
    const li = document.createElement('li');
    li.textContent = fact;
    list.appendChild(li);
  }
  card.appendChild(list);

  const basicsBox = document.createElement('div');
  basicsBox.className = 'grid-basics';
  const strong = document.createElement('strong');
  strong.textContent = `Grid basics: ${basics.title}. `;
  basicsBox.appendChild(strong);
  basicsBox.appendChild(document.createTextNode(basics.text));
  card.appendChild(basicsBox);

  els.reveal.innerHTML = '';
  els.reveal.appendChild(card);
  els.reveal.classList.remove('hidden');
}

function finishGame(fresh) {
  els.input.disabled = true;
  els.guessBtn.disabled = true;
  hideSuggestions();

  if (fresh) {
    const stats = loadStats();
    recordGame(stats, won, results.length);
    if (mode === 'daily') {
      saveDailyRecord({
        date: todayKey(),
        finished: true,
        won,
        guesses: [...guessedIso3],
      });
    }
    if (won) launchConfetti();
  }

  renderReveal();
  els.shareBtn.classList.remove('hidden');
  els.reveal.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

// ---------- Confetti (hand-rolled canvas) ----------

function launchConfetti() {
  if (reducedMotion) return;
  const canvas = els.confetti;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const colors = FUELS.map((f) => f.color).concat(['#e9f2fa', '#ffd23f']);
  const particles = [];
  const count = 140;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: window.innerHeight * 0.3,
      vx: (Math.random() - 0.5) * 11,
      vy: -Math.random() * 11 - 3,
      size: Math.random() * 7 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.25,
    });
  }

  let frame = 0;
  const maxFrames = 220;
  function tick() {
    frame += 1;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles) {
      p.vy += 0.28; // gravity
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - frame / maxFrames);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    if (frame < maxFrames) {
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }
  requestAnimationFrame(tick);
}

// ---------- Share / toast ----------

let toastTimer = null;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2400);
}

async function shareResult() {
  if (!results.length) return;
  const stats = loadStats();
  const modeTag = mode === 'daily' ? `Daily ${todayKey()}` : 'Free play';
  const outcome = won ? `${results.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const text = [
    `⚡ Power Mixdle — ${modeTag} · ${outcome}`,
    buildShareGrid(results),
    `🔥 Streak: ${stats.streak}`,
    location.href,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showToast('Result copied to clipboard!');
  } catch (_) {
    // Clipboard API unavailable (non-secure context): fallback path.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Result copied to clipboard!');
    } catch (err) {
      showToast('Copy failed — select and copy manually');
    }
    ta.remove();
  }
}

// ---------- Stats modal ----------

function openStats() {
  const stats = loadStats();
  $('stat-played').textContent = String(stats.played);
  $('stat-winpct').textContent =
    stats.played > 0 ? `${Math.round((stats.won / stats.played) * 100)}%` : '0%';
  $('stat-streak').textContent = String(stats.streak);
  $('stat-best').textContent = String(stats.bestStreak);

  const dist = $('distribution');
  dist.innerHTML = '';
  const rows = ['1', '2', '3', '4', '5', '6', 'fail'];
  const max = Math.max(1, ...rows.map((r) => stats.distribution[r] || 0));
  const currentGuesses = gameOver ? (won ? String(results.length) : 'fail') : null;
  for (const r of rows) {
    const value = stats.distribution[r] || 0;
    const row = document.createElement('div');
    row.className = 'dist-row';
    const label = document.createElement('span');
    label.className = 'dist-label';
    label.textContent = r === 'fail' ? '✕' : r;
    const bar = document.createElement('div');
    bar.className = 'dist-bar';
    if (r === currentGuesses) bar.classList.add('current');
    bar.style.width = `${Math.max(10, (value / max) * 80)}%`;
    bar.textContent = String(value);
    row.append(label, bar);
    dist.appendChild(row);
  }
  els.statsModal.classList.remove('hidden');
  if (els.statsClose) els.statsClose.focus();
}

function closeStats() {
  els.statsModal.classList.add('hidden');
  if (els.statsBtn) els.statsBtn.focus();
}

// ---------- Footer fuel facts ----------

function renderFuelFacts() {
  for (const f of FUELS) {
    const wrap = document.createElement('div');
    wrap.className = 'fuel-fact';
    const dt = document.createElement('dt');
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = f.color;
    dt.append(dot, document.createTextNode(f.label));
    const dd = document.createElement('dd');
    dd.textContent = FUEL_FACTS[f.key] || '';
    wrap.append(dt, dd);
    els.fuelFacts.appendChild(wrap);
  }
}

// ---------- Wiring ----------

function bindEvents() {
  els.input.addEventListener('input', () => {
    if (gameOver) return;
    renderSuggestions(findMatches(els.input.value));
  });

  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveHighlight(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      tryGuessFromInput();
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  els.input.addEventListener('blur', () => {
    // Delay so a mousedown on a suggestion can register first.
    setTimeout(hideSuggestions, 120);
  });

  els.guessBtn.addEventListener('click', tryGuessFromInput);
  els.shareBtn.addEventListener('click', shareResult);
  els.newGameBtn.addEventListener('click', () => startGame('free'));
  els.modeDaily.addEventListener('click', () => startGame('daily'));
  els.modeFree.addEventListener('click', () => startGame('free'));
  els.statsBtn.addEventListener('click', openStats);
  els.statsClose.addEventListener('click', closeStats);
  els.statsModal.addEventListener('click', (e) => {
    if (e.target === els.statsModal) closeStats();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.statsModal.classList.contains('hidden')) {
      closeStats();
    }
  });
  els.retryBtn.addEventListener('click', () => init());
}

// ---------- Boot ----------

async function init() {
  els.errorState.classList.add('hidden');
  els.playArea.classList.add('hidden');
  try {
    countries = await loadCountries();
  } catch (err) {
    els.errorMessage.textContent =
      'The country data failed to load. Check your connection and try again.';
    els.errorState.classList.remove('hidden');
    return;
  }
  countryList = Object.values(countries.countries).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  if (countryList.length === 0) {
    els.errorMessage.textContent = 'The data file loaded but contains no countries.';
    els.errorState.classList.remove('hidden');
    return;
  }
  els.playArea.classList.remove('hidden');
  startGame('daily');
}

renderFuelFacts();
bindEvents();
init();
