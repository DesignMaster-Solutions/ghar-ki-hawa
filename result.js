// Builds the result card as plain data (no DOM), so tests can read every line the user will see.
// Each line has a kind; 'indoor' lines must only show estimates through formatRange().
import {
  naqiCategory, indoorRange, cadrNeeded, epaCadrRule, cfmToM3h, m3hToCfm, bestAiringHours,
  formatRange, DIY_PRESETS, LIMITS, FT_TO_M,
} from './model.js';
import { t, CATEGORY_LABEL, HEALTH_GLOSS_HI } from './i18n.js';

export function roomSize({ length, width, height, unit }) {
  const f = unit === 'ft' ? FT_TO_M : 1;
  const volumeM3 = length * width * height * f ** 3;
  const areaSqFt = (length * width * f * f) / FT_TO_M ** 2;
  return { volumeM3, areaSqFt };
}

/** Indian Standard Time "YYYY-MM-DDTHH:00", the format Open-Meteo returns for Asia/Kolkata. */
export function istHour(date) {
  return new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 13) + ':00';
}

export function fromNow(hourly, now) {
  const h = istHour(now);
  const i = hourly.findIndex((x) => x.time >= h);
  return i < 0 ? [] : hourly.slice(i);
}

/** CADR range {low, high} in m3/h of the purifier the user chose (null for none). */
export function purifierCadr(p) {
  if (p?.type === 'commercial') return { low: p.cadrM3h, high: p.cadrM3h };
  if (p?.type === 'diy') {
    const d = DIY_PRESETS.find((x) => x.key === p.diy);
    return { low: cfmToM3h(d.low), high: cfmToM3h(d.high) };
  }
  return null;
}

// Indoor range with an uncertain CADR: the low end takes the strongest purifier, the high end the weakest.
function rangeWith(cOut, windows, volumeM3, cadr) {
  if (!cadr) return indoorRange({ cOut, windows, volumeM3 });
  return {
    low: indoorRange({ cOut, windows, volumeM3, cadrM3h: cadr.high }).low,
    high: indoorRange({ cOut, windows, volumeM3, cadrM3h: cadr.low }).high,
  };
}

const r0 = (x) => Math.round(x);
const hhmm = (time) => time.slice(11, 16);
const plusHour = (time) => `${String((Number(time.slice(11, 13)) + 1) % 24).padStart(2, '0')}:00`;
const span = (lo, hi) => (r0(lo) === r0(hi) ? `${r0(lo)}` : `${r0(lo)}-${r0(hi)}`);

export function buildResult(plan) {
  const { lang, placeName, room, windows, purifier, who = [], url = '' } = plan;
  const L = (k, v) => t(lang, k, v);
  const next = fromNow(plan.hourly, plan.now).filter((h) => Number.isFinite(h.pm25));
  if (!next.length) throw new Error('no forecast hours');
  const day = next.slice(0, 24);
  const outNow = next[0].pm25;
  const out24 = day.reduce((s, h) => s + h.pm25, 0) / day.length;
  const max24 = Math.max(...day.map((h) => h.pm25));
  const { volumeM3, areaSqFt } = roomSize(room);

  const blocks = [];
  const catLines = (v) => {
    const c = naqiCategory(v);
    const lines = [
      { kind: 'text', text: L('category', { label: CATEGORY_LABEL[lang][c.key] }) },
      { kind: 'health', text: L('health', { text: c.health_en }), cat: c.key },
    ];
    if (lang === 'hi') lines.push({ kind: 'text', text: L('health_gloss', { text: HEALTH_GLOSS_HI[c.key] }) });
    return lines;
  };
  blocks.push({
    id: 'outdoor', title: L('res_outdoor'), cat: naqiCategory(outNow).key,
    lines: [
      { kind: 'outdoor', text: L('out_now', { v: r0(outNow) }) },
      ...catLines(outNow),
      { kind: 'outdoor', text: L('out_24', { v: r0(out24), max: r0(max24) }) },
      ...catLines(out24),
    ],
  });

  const own = purifierCadr(purifier);
  const ruleCfm = epaCadrRule(areaSqFt);
  const purCadr = own || { low: cfmToM3h(ruleCfm), high: cfmToM3h(ruleCfm) };
  const scenarios = [
    ['asis', L('sc_asis'), windows, own],
    ['closed', L('sc_closed'), 'closed', null],
    ['purifier', own ? L('sc_purifier') : L('sc_purifier_rule', { cfm: r0(ruleCfm) }), 'closed', purCadr],
  ];
  const indoor = {};
  for (const [key, , win, cadr] of scenarios) {
    indoor[key] = { now: rangeWith(outNow, win, volumeM3, cadr), day: rangeWith(out24, win, volumeM3, cadr) };
  }
  blocks.push({
    id: 'indoor', title: L('res_indoor'), note: L('indoor_note'),
    rows: scenarios.map(([key, label]) => ({
      key, label, now: formatRange(indoor[key].now.low, indoor[key].now.high), day: formatRange(indoor[key].day.low, indoor[key].day.high),
    })),
    lines: scenarios.map(([key, label]) => ({
      kind: 'indoor',
      text: L('indoor_line', {
        label, now: formatRange(indoor[key].now.low, indoor[key].now.high), day: formatRange(indoor[key].day.low, indoor[key].day.high),
      }),
    })),
  });

  const cadrLines = [[LIMITS.india24h, 'who_india'], [LIMITS.who24h, 'who_who']].map(([target, whoKey]) => {
    const need = cadrNeeded({ cOut: out24, target, windows: 'closed', volumeM3 });
    if (need.high === 0) return { kind: 'cadr', text: L('cadr_zero', { target, who: L(whoKey) }) };
    return {
      kind: 'cadr',
      text: L('cadr_target', {
        target, who: L(whoKey), m3h: span(need.low, need.high), cfm: span(m3hToCfm(need.low), m3hToCfm(need.high)),
      }),
    };
  });
  cadrLines.push({ kind: 'cadr', text: L('cadr_epa', { cfm: r0(ruleCfm), m3h: r0(cfmToM3h(ruleCfm)) }) });
  if (own) {
    cadrLines.push({
      kind: 'cadr', text: L('cadr_have', { cadr: `${span(own.low, own.high)} m3/h (${span(m3hToCfm(own.low), m3hToCfm(own.high))} cfm)` }),
    });
  }
  blocks.push({ id: 'cadr', title: L('res_cadr'), lines: cadrLines });

  const best = bestAiringHours(next, 2);
  const airText = best ? `${hhmm(best.start)}-${plusHour(best.end)}` : '';
  blocks.push({
    id: 'air', title: L('res_air'),
    lines: [{ kind: 'outdoor', text: best ? L('air_line', { from: hhmm(best.start), to: plusHour(best.end), v: r0(best.mean) }) : L('air_none') }],
  });

  if (who.length) blocks.push({ id: 'sensitive', title: '', lines: [{ kind: 'text', text: L('sensitive') }] });
  if (purifier?.type === 'diy') {
    blocks.push({ id: 'safety', title: L('res_safety'), lines: ['safety_1', 'safety_2', 'safety_3', 'safety_4'].map((k) => ({ kind: 'safety', text: L(k) })) });
  }

  const shareText = L('share_text', {
    place: placeName, out: r0(outNow), label: CATEGORY_LABEL[lang][naqiCategory(outNow).key],
    asis: formatRange(indoor.asis.now.low, indoor.asis.now.high),
    pur: formatRange(indoor.purifier.now.low, indoor.purifier.now.high),
    air: airText || '-', url,
  });
  return { title: L('res_title', { place: placeName }), blocks, shareText, indoor };
}
