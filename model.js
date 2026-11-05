// Pure functions for Ghar Ki Hawa. No DOM, no network. Every constant here comes from BRIEF.md
// ("Verified sources"); SOURCES holds the link for each one so the UI can cite it.

export const SOURCES = {
  cpcb: { name: 'CPCB National Air Quality Index (2014), AQI bulletin health statements', url: 'https://cpcb.gov.in//upload/Downloads/Delhi-NCR/NCR_AQI_Bulletin_2026_10_29.pdf' },
  naaqs: { name: 'CPCB National Ambient Air Quality Standards (2009)', url: 'https://cpcb.nic.in/air-quality-standard/' },
  who: { name: 'WHO Global Air Quality Guidelines (2021)', url: 'https://www.who.int/publications/i/item/9789240034228' },
  xiang: { name: 'Xiang et al., Sci. Total Environ. 773 (2021) 145642, Eq. 2', url: 'https://doi.org/10.1016/j.scitotenv.2021.145642' },
  cao: { name: 'Cao & Frey, Atmospheric Environment 45 (2011) 5684', url: 'https://doi.org/10.1016/j.atmosenv.2011.07.034' },
  liao: { name: 'Liao et al., IJERPH 16 (2019) 1391 (Delhi simulation, not a field measurement)', url: 'https://doi.org/10.3390/ijerph16081391' },
  epaGuide: { name: 'US EPA, Guide to Air Cleaners in the Home, 2nd ed. (2018)', url: 'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home' },
  epaDiy: { name: 'US EPA, Research on DIY Air Cleaners to Reduce Wildfire Smoke Indoors', url: 'https://www.epa.gov/air-research/research-diy-air-cleaners-reduce-wildfire-smoke-indoors' },
  kulshreshtha: { name: 'Kulshreshtha & Khare, Atmospheric Pollution Research 2 (2011) 337, PM2.5 measured in 8 Delhi homes', url: 'https://doi.org/10.5094/APR.2011.038' },
  lancet: { name: 'India State-Level Disease Burden Initiative, Lancet Planet. Health 5 (2021) e25-e38', url: 'https://doi.org/10.1016/S2542-5196(20)30298-9' },
  openMeteo: { name: 'Open-Meteo Air Quality API (CAMS), CC BY 4.0', url: 'https://open-meteo.com/en/docs/air-quality-api' },
};

export const LIMITS = { india24h: 60, who24h: 15 }; // ug/m3, sources: naaqs, who

const CATEGORIES = [
  { max: 30, key: 'good', label_en: 'Good', health_en: 'Minimal Impact' },
  { max: 60, key: 'satisfactory', label_en: 'Satisfactory', health_en: 'Minor breathing discomfort to sensitive people' },
  { max: 90, key: 'moderate', label_en: 'Moderately polluted', health_en: 'Breathing discomfort to the people with lungs, asthma and heart diseases' },
  { max: 120, key: 'poor', label_en: 'Poor', health_en: 'Breathing discomfort to most people on prolonged exposure' },
  { max: 250, key: 'very_poor', label_en: 'Very poor', health_en: 'Respiratory illness on prolonged exposure' },
  { max: Infinity, key: 'severe', label_en: 'Severe', health_en: 'Affects healthy people and seriously impacts those with existing diseases' },
];

/** CPCB PM2.5 24-h category; the value is rounded to an integer first (30.4 good, 30.6 satisfactory). */
export function naqiCategory(pm25) {
  const v = Math.round(Math.max(0, pm25));
  const { key, label_en, health_en } = CATEGORIES.find((c) => v <= c.max);
  return { key, label_en, health_en };
}

/** Steady-state indoor PM2.5 with no indoor source (Xiang et al. 2021, Eq. 2). */
export function indoorSteadyState({ cOut, P, a, k, cadrM3h = 0, volumeM3 }) {
  return (P * a * cOut) / (a + k + cadrM3h / volumeM3);
}

export const ASSUMPTIONS = {
  P: { low: 0.7, high: 1.0, unit: '', source: 'cao' },
  k: { low: 0.1, high: 0.6, unit: '1/h', source: 'xiang' }, // union of Xiang 0.10-0.49 and Cao 0.2-0.6
  aClosed: { low: 0.3, high: 1.5, unit: '1/h', source: 'xiang' }, // Xiang 0.30-1.41, Liao Delhi mean 1.5
  aOpen: { low: 3.3, high: 6.8, unit: '1/h', source: 'liao' }, // Liao mean 3.3, Xiang 6.77
  fewTimes: { openHours: 2, closedHours: 22, source: 'ours' }, // our assumption, labelled as such
};

// Low end = low P, low a, high k; high end = high P, high a, low k.
function bounds(windows) {
  const { P, k, aClosed, aOpen } = ASSUMPTIONS;
  const end = (side) => {
    const p = P[side];
    const kk = side === 'low' ? k.high : k.low;
    const mix = windows === 'few'
      ? [[aOpen[side], ASSUMPTIONS.fewTimes.openHours], [aClosed[side], ASSUMPTIONS.fewTimes.closedHours]]
      : [[(windows === 'open' ? aOpen : aClosed)[side], 1]];
    return { P: p, k: kk, mix };
  };
  if (!['closed', 'open', 'few'].includes(windows)) throw new Error(`windows: ${windows}`);
  return { low: end('low'), high: end('high') };
}

function weighted({ P, k, mix }, cOut, cadrM3h, volumeM3) {
  const hours = mix.reduce((s, [, h]) => s + h, 0);
  return mix.reduce((s, [a, h]) => s + h * indoorSteadyState({ cOut, P, a, k, cadrM3h, volumeM3 }), 0) / hours;
}

/** Indoor range {low, high} in ug/m3 ('few' = time-weighted 2 h open + 22 h closed). */
export function indoorRange({ cOut, windows, cadrM3h = 0, volumeM3 }) {
  const b = bounds(windows);
  return { low: weighted(b.low, cOut, cadrM3h, volumeM3), high: weighted(b.high, cOut, cadrM3h, volumeM3) };
}

/** CADR (m3/h) that brings the indoor level down to target; floor 0. Bisection also covers 'few'. */
export function cadrNeeded({ cOut, target, windows, volumeM3 }) {
  const b = bounds(windows);
  const solve = (end) => {
    const f = (c) => weighted(end, cOut, c, volumeM3);
    if (f(0) <= target) return 0;
    let lo = 0, hi = 1;
    while (f(hi) > target && hi < 1e9) hi *= 2; // cap: never loop forever
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; f(m) > target ? (lo = m) : (hi = m); }
    return hi; // hi always satisfies f(hi) <= target
  };
  return { low: solve(b.low), high: solve(b.high) };
}

export const cfmToM3h = (x) => x * 1.699;
export const m3hToCfm = (x) => x / 1.699;
/** EPA/AHAM rule: CADR in cfm at least 2/3 of the room area in sq ft. */
export const epaCadrRule = (areaSqFt) => (areaSqFt * 2) / 3;

/** EPA measured wildfire-smoke CADR (cfm) of DIY boxes, mean +/- spread, as ranges. */
export const DIY_PRESETS = [
  { key: 'fan1', cfm: 111, pm: 1 },
  { key: 'fan1shroud', cfm: 156, pm: 4 },
  { key: 'fan4in', cfm: 248, pm: 15 },
  { key: 'fan2', cfm: 263, pm: 22 },
  { key: 'cr4', cfm: 401, pm: 31 },
].map((d) => ({ ...d, low: d.cfm - d.pm, high: d.cfm + d.pm }));

/** The n consecutive hours with the lowest mean pm25 among the first 24 entries, every hour inside
 *  from..to (local clock hour), so by default the pair starts at 06:00 at the earliest and ends by 21:00.
 *  Without the limit the Delhi backtest (evidence/backtest) sent people to air the room at 01:00-05:00. */
export function bestAiringHours(hourly, n = 2, { from = 6, to = 20 } = {}) {
  const next = hourly.slice(0, 24);
  const awake = (h) => { const hh = Number(h.time.slice(11, 13)); return hh >= from && hh <= to; };
  let best = null;
  for (let i = 0; i + n <= next.length; i++) {
    const win = next.slice(i, i + n);
    if (win.some((h) => !Number.isFinite(h.pm25) || !awake(h))) continue;
    const mean = win.reduce((s, h) => s + h.pm25, 0) / n;
    if (!best || mean < best.mean) best = { start: win[0].time, end: win[n - 1].time, mean, index: i };
  }
  return best;
}

/** The only way an indoor estimate reaches the screen. */
export function formatRange(low, high) {
  const [a, b] = [Math.round(low), Math.round(high)].sort((x, y) => x - y);
  return `${a}-${b} ug/m3`;
}

export const FT_TO_M = 0.3048;
