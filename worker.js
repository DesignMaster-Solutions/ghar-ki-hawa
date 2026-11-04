// Ghar Ki Hawa Worker: static assets are served directly; only /api/* runs here.
// - Anonymous counter (Durable Object): event name, language and, for feedback, two monitor readings
//   and the day. Never answers, room details, health choices, places or IPs.
// - Forecast cache: an hourly cron stores the Open-Meteo (CAMS) PM2.5 forecast of the ~50 largest
//   cities, so the page answers even when Open-Meteo is slow.
import { CITIES } from './cities.js';
import { omUrl, toHourly } from './openmeteo.js';

export { omUrl };

const EVENTS = new Set(['plan', 'share', 'feedback']);
const LANGS = new Set(['en', 'hi']);
const reading = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 2000;

async function fetchOM(points, ms) {
  const res = await fetch(omUrl(points), { signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const body = await res.json();
  return (Array.isArray(body) ? body : [body]).map(toHourly);
}

export class Counter {
  constructor(state) { this.storage = state.storage; }

  async fetch(req) {
    const { pathname, searchParams } = new URL(req.url);
    if (pathname === '/api/event') return this.event(req);
    if (pathname === '/api/stats') return this.stats();
    if (pathname === '/fc/get') {
      return Response.json((await this.storage.get(`fc:${searchParams.get('id')}`)) || null);
    }
    if (pathname === '/fc/put') {
      const { items } = await req.json();
      for (const it of items) await this.storage.put(`fc:${it.id}`, { fetched: it.fetched, hourly: it.hourly });
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }

  async event(req) {
    let body;
    try { body = JSON.parse(await req.text()); } catch { return new Response('bad json', { status: 400 }); }
    if (!EVENTS.has(body?.event) || !LANGS.has(body?.lang)) return new Response('bad event', { status: 400 });
    if (body.event === 'feedback' && !(reading(body.before) && reading(body.after))) {
      return new Response('bad readings', { status: 400 });
    }
    const day = new Date().toISOString().slice(0, 10);
    const totalKey = `total:${body.event}`;
    const total = ((await this.storage.get(totalKey)) || 0) + 1;
    await this.storage.put(totalKey, total);
    for (const k of [`lang:${body.lang}:${body.event}`, `day:${day}:${body.event}`]) {
      await this.storage.put(k, ((await this.storage.get(k)) || 0) + 1);
    }
    if (body.event === 'feedback') {
      const r1 = (x) => Math.round(x * 10) / 10;
      await this.storage.put(`fb:${String(total).padStart(7, '0')}`, { day, before: r1(body.before), after: r1(body.after) });
    }
    return new Response(null, { status: 204 });
  }

  async stats() {
    const all = await this.storage.list();
    const counts = {};
    const readings = [];
    for (const [k, v] of all) {
      if (/^(total|lang|day):/.test(k)) counts[k] = v;
      else if (k.startsWith('fb:')) readings.push(v);
    }
    return Response.json({ since: '2026-11-04', counts, readings }, { headers: { 'cache-control': 'no-store' } });
  }
}

const counter = (env) => env.COUNTER.get(env.COUNTER.idFromName('global'));
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'public, max-age=600' } });

export async function refreshAll(env) {
  const fetched = new Date().toISOString();
  const series = await fetchOM(CITIES, 30000);
  const items = CITIES.map((c, i) => ({ id: c.id, fetched, hourly: series[i] })).filter((x) => x.hourly?.length);
  await counter(env).fetch(new Request('https://do/fc/put', { method: 'POST', body: JSON.stringify({ items }) }));
  return items.length;
}

async function forecast(url, env) {
  const id = url.searchParams.get('city');
  if (id) {
    const city = CITIES.find((c) => c.id === id);
    if (!city) return json({ error: 'unknown city' }, 404);
    const cached = await (await counter(env).fetch(new Request(`https://do/fc/get?id=${encodeURIComponent(id)}`))).json();
    if (cached && Date.now() - Date.parse(cached.fetched) < 3 * 3600e3) return json({ place: id, source: 'cache', ...cached });
    try {
      const [hourly] = await fetchOM([city], 10000);
      const fresh = { fetched: new Date().toISOString(), hourly };
      await counter(env).fetch(new Request('https://do/fc/put', { method: 'POST', body: JSON.stringify({ items: [{ id, ...fresh }] }) }));
      return json({ place: id, source: 'live', ...fresh });
    } catch {
      return cached ? json({ place: id, source: 'stale', ...cached }) : json({ error: 'forecast unavailable' }, 502);
    }
  }
  // Rounded to 2 decimals (about 1 km) before it leaves the Worker; never stored.
  const lat = Math.round(Number(url.searchParams.get('lat')) * 100) / 100;
  const lon = Math.round(Number(url.searchParams.get('lon')) * 100) / 100;
  if (!url.searchParams.has('lat') || !url.searchParams.has('lon') || !(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) {
    return json({ error: 'need city or lat and lon' }, 400);
  }
  try {
    const [hourly] = await fetchOM([{ lat, lon }], 10000);
    return json({ place: `${lat},${lon}`, source: 'live', fetched: new Date().toISOString(), hourly });
  } catch {
    return json({ error: 'forecast unavailable' }, 502);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const { pathname } = url;
    if (pathname === '/api/event' || pathname === '/api/stats') {
      const wanted = pathname === '/api/event' ? 'POST' : 'GET';
      if (req.method !== wanted) return new Response(null, { status: 405 });
      return counter(env).fetch(req);
    }
    if (pathname === '/api/forecast') {
      if (req.method !== 'GET') return new Response(null, { status: 405 });
      return forecast(url, env);
    }
    if (pathname.startsWith('/api/')) return new Response(null, { status: 404 });
    return env.ASSETS.fetch(req);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refreshAll(env));
  },
};
