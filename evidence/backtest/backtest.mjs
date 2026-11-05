// Backtest of "the best 2 hours to air the room" against PM2.5 measured in New Delhi.
// node evidence/backtest/backtest.mjs [--awake]   (reads days/*.csv written by fetch.mjs)
// Each day: the app is opened at 07:00 IST, picks 2 hours with bestAiringHours() from the CAMS series
// of the next 24 hours, and we look at what the monitor actually measured in those 2 hours.
import { readFileSync, readdirSync } from 'node:fs';
import { bestAiringHours } from '../../model.js';

const DIR = new URL('./days/', import.meta.url);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const pct = (app, base) => { const p = Math.round((app / base - 1) * 100); return p > 0 ? `+${p}%` : `${p}%`; };
const hourOf = (t) => Number(t.slice(11, 13));

export function loadDays() {
  return readdirSync(DIR).filter((f) => f.endsWith('.csv')).sort().map((f) => {
    const rows = readFileSync(new URL(f, DIR), 'utf8').trim().split('\n').slice(1).map((l) => {
      const [time, m, c] = l.split(',');
      return { time, measured: m === '' ? NaN : Number(m), cams: c === '' ? NaN : Number(c) };
    });
    return { day: f.slice(0, 10), rows };
  });
}

const pair = (rows, start) => [rows[start].measured, rows[start + 1].measured];

export function evaluateDay({ day, rows }, { awakeOnly = false } = {}) {
  const win = rows.slice(1, 25); // 07:00 D .. 06:00 D+1, what the app sees at 07:00
  const keep = (h) => !awakeOnly || (hourOf(h.time) >= 6 && hourOf(h.time) <= 20);
  const camsSeries = win.map((r) => ({ time: r.time, pm25: keep(r) ? r.cams : NaN }));
  const pick = bestAiringHours(camsSeries, 2);
  if (!pick) return null;
  const app = pair(win, pick.index);
  const daytime = rows.slice(0, 16).map((r) => r.measured).filter(Number.isFinite); // 06:00-21:00 starts
  const at = (hh) => rows.findIndex((r) => hourOf(r.time) === hh);
  const morning = pair(rows, at(8)), evening = pair(rows, at(18));
  const best = bestAiringHours(win.map((r) => ({ time: r.time, pm25: keep(r) ? r.measured : NaN })), 2);
  if (!app.every(Number.isFinite) || daytime.length < 12 || !best) return null;
  return {
    day, season: day.slice(0, 4), start: pick.start, night: hourOf(pick.start) <= 5,
    app: mean(app), daily: mean(daytime),
    morning: morning.every(Number.isFinite) ? mean(morning) : NaN,
    evening: evening.every(Number.isFinite) ? mean(evening) : NaN,
    best: best.mean,
  };
}

function summarize(days) {
  const vs = (k) => {
    const d = days.filter((x) => Number.isFinite(x[k]));
    return {
      change: pct(mean(d.map((x) => x.app)), mean(d.map((x) => x[k]))),
      lowerDays: d.filter((x) => x.app < x[k]).length, of: d.length,
    };
  };
  const daily = mean(days.map((x) => x.daily)), app = mean(days.map((x) => x.app)), best = mean(days.map((x) => x.best));
  return {
    days: days.length, nightPicks: days.filter((x) => x.night).length,
    meanApp: Math.round(app), meanDaily: Math.round(daily), meanBest: Math.round(best),
    vsDaily: vs('daily'), vsMorning: vs('morning'), vsEvening: vs('evening'),
    // share of the cut the perfect choice (measured best 2 hours) would have given, against the daily mean
    capturedPct: Math.round(((daily - app) / (daily - best)) * 100),
  };
}

export function runBacktest(opts = {}) {
  const days = loadDays().map((d) => evaluateDay(d, opts)).filter(Boolean);
  const seasons = {};
  for (const s of [...new Set(days.map((d) => d.season))]) seasons[s] = summarize(days.filter((d) => d.season === s));
  return { all: summarize(days), seasons };
}

/** The markdown table the README carries; tests/backtest.test.mjs checks the README against it. */
export function table(r) {
  const out = [
    '| Season | Days | App picks | Daytime mean 06-22 h | App vs daytime | Best 2 h (measured) | Share of best cut | App vs 08-10 h | App vs 18-20 h | Picks 00-05 h |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const [s, x] of [...Object.entries(r.seasons), ['All', r.all]]) {
    out.push(`| ${s === 'All' ? '**All**' : `Oct-Nov ${s}`} | ${x.days} | ${x.meanApp} | ${x.meanDaily} | ${x.vsDaily.change}, lower on ${x.vsDaily.lowerDays}/${x.vsDaily.of} days | ${x.meanBest} | ${x.capturedPct}% | ${x.vsMorning.change}, ${x.vsMorning.lowerDays}/${x.vsMorning.of} | ${x.vsEvening.change}, ${x.vsEvening.lowerDays}/${x.vsEvening.of} | ${x.nightPicks} |`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(table(runBacktest({ awakeOnly: process.argv.includes('--awake') })).join('\n'));
}
