import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

const BASE = 'https://ghar-ki-hawa.designmaster.workers.dev/';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Judges and WhatsApp previews read the head; search engines need canonical + hreflang to index ?lang=hi.
test('head carries canonical, hreflang en/hi, Open Graph and a WebApplication JSON-LD', () => {
  assert.match(html, new RegExp(`<link rel="canonical" href="${BASE}">`));
  for (const l of ['en', 'hi']) assert.match(html, new RegExp(`hreflang="${l}" href="${BASE}\\?lang=${l}"`));
  assert.match(html, /hreflang="x-default"/);
  for (const p of ['og:title', 'og:description', 'og:url', 'og:image']) {
    assert.match(html, new RegExp(`property="${p}" content="[^"]+"`), p);
  }
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'WebApplication');
  assert.equal(ld.url, BASE);
  assert.deepEqual(ld.inLanguage, ['en', 'hi']);
  assert.ok(statSync(new URL('../og.png', import.meta.url)).size > 10_000, 'og.png is a real screenshot');
});

// Workers Assets with the SPA fallback answered /robots.txt and /sitemap.xml with index.html (HTTP 200), so the
// apps were invisible to Google/Bing (R450, 07/11/2026): the files must exist and unknown paths must be real 404s.
test('robots.txt, sitemap.xml and the IndexNow key are real files and the SPA fallback is off', () => {
  const robots = readFileSync(new URL('../robots.txt', import.meta.url), 'utf8');
  assert.match(robots, /^User-agent: \*\nAllow: \/\nDisallow: \/api\/\n/m);
  assert.match(robots, new RegExp(`^Sitemap: ${BASE}sitemap.xml$`, 'm'));
  const sitemap = readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8');
  for (const u of ['', '?lang=en', '?lang=hi', 'stats']) assert.match(sitemap, new RegExp(`<loc>${BASE.replace('?', '\\?')}${u.replace('?', '\\?')}</loc>`), u);
  assert.match(sitemap, /hreflang="hi"/);
  const keyFile = readdirSync(new URL('..', import.meta.url)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  assert.ok(keyFile, 'IndexNow key file <key>.txt in the site root');
  assert.equal(readFileSync(new URL('../' + keyFile, import.meta.url), 'utf8').trim(), keyFile.slice(0, -4));
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /not_found_handling = "none"/);
  assert.doesNotMatch(toml, /single-page-application/);
});
