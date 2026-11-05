// Downloads the data the backtest uses and writes one small CSV per day (node evidence/backtest/fetch.mjs).
// Measured: OpenAQ public archive, location 8118 "New Delhi-8118" = AirNow site DS1010001,
// U.S. Department of State India - New Delhi (hourly PM2.5). Model: Open-Meteo Air Quality archive (CAMS).
// Each file holds 06:00 IST of day D to 06:00 of D+1 (25 rows): 06-22 for the daily baseline,
// 07:00 onward for the 24 hours the app sees when opened at 07:00.
import { gunzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const LAT = 28.63576, LON = 77.22445;
const DIR = new URL('./days/', import.meta.url);
const YEARS = [2022, 2023, 2024, 2025];
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.toISOString().slice(0, 10);
// OpenAQ labels each hourly mean by the END of its hour (a day file runs 01:00 to 24:00), so the
// mean for the clock hour that starts at t is the value labelled t + 1 h. The CSV stores it at t,
// the same label the app shows ("air 07:00-09:00" = CAMS values at 07:00 and 08:00).
const nextHour = (t) => new Date(Date.parse(t + ':00+05:30') + 36e5 + 19800e3).toISOString().slice(0, 16);
const addDays = (s, n) => iso(new Date(Date.parse(s + 'T00:00Z') + n * 864e5));

async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) }).catch((e) => ({ ok: false, status: e.message }));
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 404 || r.status === 403) return null; // no file for that day
    if (i >= tries) throw new Error(`${url}: ${r.status}`);
  }
}

// OpenAQ "datetime" is IST with offset; keep "YYYY-MM-DDTHH:00" as the key. Only whole-hour rows: in
// 2023 the archive also carries a copy of the same values stamped at :30 and shifted 6.5 h (its peak
// lands at 13:30, against Delhi's night-time peak), and -999 marks a missing hour.
async function measuredDay(day) {
  const [y, m, d] = day.split('-');
  const buf = await get(`https://openaq-data-archive.s3.amazonaws.com/records/csv.gz/locationid=8118/year=${y}/month=${m}/location-8118-${y}${m}${d}.csv.gz`);
  const out = {};
  if (!buf) return out;
  for (const line of gunzipSync(buf).toString().trim().split('\n').slice(1)) {
    const c = line.replaceAll('"', '').split(',');
    if (c[6] !== 'pm25' || !c[3].endsWith(':00:00+05:30')) continue;
    const v = Number(c[8]);
    if (Number.isFinite(v) && v >= 0 && v < 2000) out[c[3].slice(0, 16)] = v;
  }
  return out;
}

mkdirSync(DIR, { recursive: true });
for (const y of YEARS) {
  const start = `${y}-10-01`, end = `${y}-12-01`;
  const om = JSON.parse(await get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&hourly=pm2_5&start_date=${start}&end_date=${end}&timezone=Asia%2FKolkata`));
  const cams = Object.fromEntries(om.hourly.time.map((t, i) => [t, om.hourly.pm2_5[i]]));
  const meas = {};
  for (let d = start; d <= end; d = addDays(d, 1)) Object.assign(meas, await measuredDay(d));
  for (let d = start; d < end; d = addDays(d, 1)) {
    const rows = ['time,measured,cams'];
    for (let h = 0; h < 25; h++) {
      const day = h + 6 < 24 ? d : addDays(d, 1);
      const t = `${day}T${pad((h + 6) % 24)}:00`;
      rows.push(`${t},${meas[nextHour(t)] ?? ''},${cams[t] ?? ''}`);
    }
    writeFileSync(new URL(`${d}.csv`, DIR), rows.join('\n') + '\n');
  }
  console.log(y, 'cams hours', om.hourly.time.length, 'measured hours', Object.keys(meas).length);
}
