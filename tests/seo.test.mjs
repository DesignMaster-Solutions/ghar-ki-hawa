import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

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
