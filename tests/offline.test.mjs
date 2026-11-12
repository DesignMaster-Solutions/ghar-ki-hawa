// Power cuts and patchy mobile data are routine: the app must open offline, and the plan made
// this morning must still open in the evening without pretending to be fresh.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { savedForecast } from '../result.js';
import { STRINGS } from '../i18n.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('sw.js precaches every file the first screen needs', () => {
  const sw = read('sw.js');
  const needed = new Set(['/']);
  for (const m of read('index.html').matchAll(/(?:href|src)="([\w.-]+\.(?:css|js))"/g)) needed.add(`/${m[1]}`);
  for (const f of ['app.js', 'result.js']) for (const m of read(f).matchAll(/from '\.\/([\w.-]+\.js)'/g)) needed.add(`/${m[1]}`);
  assert.ok(needed.size >= 8, `expected index, css and 6 modules, got ${[...needed]}`);
  for (const f of needed) assert.ok(sw.includes(`'${f}'`), `sw.js does not precache ${f}`);
});

test('sw.js is network-first and never touches the forecast or counter API', () => {
  const sw = read('sw.js');
  assert.match(sw, /\/api\//, 'must skip /api/');
  assert.ok(sw.indexOf('fetch(e.request)') < sw.indexOf('caches.match('), 'network before cache');
  assert.match(sw, /ignoreSearch/, '?lang=hi must open offline too');
  assert.ok(read('app.js').includes("serviceWorker?.register('sw.js')"), 'app.js must register sw.js');
});

const hourly = Array.from({ length: 48 }, (_, i) => ({
  time: `2026-11-${12 + Math.floor(i / 24)}T${String(i % 24).padStart(2, '0')}:00`, pm25: 100, pm10: 150,
}));
const raw = JSON.stringify({ key: 'delhi', at: '2026-11-12T03:00:00.000Z', hourly });

test('a saved forecast is reused only for the same place on the same IST day', () => {
  const evening = new Date('2026-11-12T13:00:00Z'); // 18:30 IST, same day
  assert.equal(savedForecast(raw, 'delhi', evening).hourly.length, 48);
  assert.equal(savedForecast(raw, 'mumbai', evening), null, 'another city');
  assert.equal(savedForecast(raw, 'delhi', new Date('2026-11-12T19:00:00Z')), null, '00:30 IST next day: under 24 h left');
  assert.equal(savedForecast(null, 'delhi', evening), null);
  assert.equal(savedForecast('{broken', 'delhi', evening), null);
});

test('the reused plan says on screen that it is not fresh, in both languages', () => {
  for (const lang of ['en', 'hi']) assert.match(STRINGS[lang].offline_plan, /\{time\}/, lang);
  const app = read('app.js');
  assert.match(app, /savedForecast\(/);
  assert.match(app, /L\('offline_plan'/);
});
