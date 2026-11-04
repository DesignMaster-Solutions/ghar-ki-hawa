import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { Counter, omUrl, refreshAll } from '../worker.js';
import { CITIES } from '../cities.js';

class FakeStorage {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.get(k); }
  async put(k, v) { this.m.set(k, v); }
  async list() { return new Map([...this.m].sort()); }
}
const newCounter = () => new Counter({ storage: new FakeStorage() });
const post = (body) => new Request('https://x/api/event', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const stats = async (c) => (await c.fetch(new Request('https://x/api/stats'))).json();
const today = () => new Date().toISOString().slice(0, 10);
const envWith = (c) => ({
  ASSETS: { fetch: async () => new Response('asset') },
  COUNTER: { idFromName: (n) => n, get: () => c },
});
const omSeries = (v) => ({ hourly: { time: Array.from({ length: 48 }, (_, i) => `t${i}`), pm2_5: Array(48).fill(v), pm10: Array(48).fill(v * 2) } });

test('plan, share and feedback are counted in total, per language and per day', async () => {
  const c = newCounter();
  assert.equal((await c.fetch(post({ event: 'plan', lang: 'hi' }))).status, 204);
  assert.equal((await c.fetch(post({ event: 'share', lang: 'en' }))).status, 204);
  assert.equal((await c.fetch(post({ event: 'feedback', lang: 'en', before: 180.44, after: 42 }))).status, 204);
  const { counts, readings } = await stats(c);
  assert.equal(counts['total:plan'], 1);
  assert.equal(counts['lang:hi:plan'], 1);
  assert.equal(counts[`day:${today()}:share`], 1);
  assert.equal(counts['total:feedback'], 1);
  assert.deepEqual(readings, [{ day: today(), before: 180.4, after: 42 }]);
});

test('bad events, languages, readings and JSON are rejected and nothing is stored', async () => {
  const c = newCounter();
  const bad = [
    { event: 'check', lang: 'en' }, { event: 'plan', lang: 'xx' },
    { event: 'feedback', lang: 'en', before: 50 }, { event: 'feedback', lang: 'en', before: -1, after: 20 },
    { event: 'feedback', lang: 'en', before: 50, after: 2001 }, { event: 'feedback', lang: 'en', before: '50', after: 20 },
    '{not json',
  ];
  for (const b of bad) assert.equal((await c.fetch(post(b))).status, 400, JSON.stringify(b));
  assert.deepEqual(await stats(c), { since: '2026-11-04', counts: {}, readings: [] });
});

test('routing: /api/* reaches the Worker, other paths are static, wrong methods get 405', async () => {
  const env = envWith(newCounter());
  assert.equal(await (await worker.fetch(new Request('https://x/stats.html'), env)).text(), 'asset');
  assert.equal((await worker.fetch(new Request('https://x/api/stats'), env)).status, 200);
  assert.equal((await worker.fetch(post({ event: 'plan', lang: 'en' }), env)).status, 204);
  assert.equal((await worker.fetch(new Request('https://x/api/event'), env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://x/api/nope'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://x/api/forecast?city=atlantis'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://x/api/forecast?lat=abc&lon=1'), env)).status, 400);
});

test('cron stores every city from one Open-Meteo call; forecast then answers from the cache', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (u) => { calls.push(String(u)); return Response.json(CITIES.map((_, i) => omSeries(i))); });
  const env = envWith(newCounter());
  assert.equal(await refreshAll(env), CITIES.length);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], omUrl(CITIES));
  const r = await (await worker.fetch(new Request('https://x/api/forecast?city=delhi'), env)).json();
  assert.equal(r.source, 'cache');
  assert.equal(r.hourly.length, 48);
  assert.equal(r.hourly[0].pm25, CITIES.findIndex((c) => c.id === 'delhi'));
  assert.equal(calls.length, 1);
});

test('lat/lon outside the list go straight to Open-Meteo, rounded, and nothing is stored', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (u) => { calls.push(String(u)); return Response.json(omSeries(77)); });
  const c = newCounter();
  const r = await (await worker.fetch(new Request('https://x/api/forecast?lat=27.123456&lon=78.98765'), envWith(c))).json();
  assert.equal(r.source, 'live');
  assert.equal(r.hourly[5].pm25, 77);
  assert.match(calls[0], /latitude=27\.12&longitude=78\.99&/);
  assert.equal(c.storage.m.size, 0);
});
