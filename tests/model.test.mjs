import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  naqiCategory, indoorSteadyState, indoorRange, cadrNeeded, epaCadrRule, cfmToM3h, m3hToCfm,
  bestAiringHours, formatRange, ASSUMPTIONS, DIY_PRESETS,
} from '../model.js';
import { STRINGS, t } from '../i18n.js';
import { buildResult, roomSize } from '../result.js';

test('CPCB PM2.5 category edges, rounded to integer first', () => {
  const cases = [[0, 'good'], [30, 'good'], [30.4, 'good'], [30.6, 'satisfactory'], [31, 'satisfactory'],
    [60, 'satisfactory'], [61, 'moderate'], [90, 'moderate'], [91, 'poor'], [120, 'poor'], [121, 'very_poor'],
    [250, 'very_poor'], [251, 'severe'], [900, 'severe']];
  for (const [v, key] of cases) assert.equal(naqiCategory(v).key, key, `pm25 ${v}`);
  assert.equal(naqiCategory(300).health_en, 'Affects healthy people and seriously impacts those with existing diseases');
  assert.equal(naqiCategory(10).health_en, 'Minimal Impact');
});

test('CADR 0 equals infiltration only; a huge CADR tends to 0', () => {
  const base = { cOut: 200, P: 0.8, a: 1, k: 0.4, volumeM3: 30 };
  assert.equal(indoorSteadyState({ ...base, cadrM3h: 0 }), (0.8 * 1 * 200) / (1 + 0.4));
  assert.ok(indoorSteadyState({ ...base, cadrM3h: 1e9 }) < 1e-3);
  const r = indoorRange({ cOut: 200, windows: 'closed', volumeM3: 30 });
  assert.ok(r.low < r.high && r.high < 200);
  assert.ok(indoorRange({ cOut: 200, windows: 'closed', volumeM3: 30, cadrM3h: 1e9 }).high < 1e-3);
});

test('range ends follow the brief: low = low P, low a, high k; few = time-weighted', () => {
  const { P, k, aClosed, aOpen, fewTimes } = ASSUMPTIONS;
  const f = (p, a, kk) => indoorSteadyState({ cOut: 100, P: p, a, k: kk, volumeM3: 30 });
  const closed = indoorRange({ cOut: 100, windows: 'closed', volumeM3: 30 });
  assert.equal(closed.low, f(P.low, aClosed.low, k.high));
  assert.equal(closed.high, f(P.high, aClosed.high, k.low));
  const few = indoorRange({ cOut: 100, windows: 'few', volumeM3: 30 });
  const h = fewTimes.openHours + fewTimes.closedHours;
  assert.ok(Math.abs(few.high - (fewTimes.openHours * f(P.high, aOpen.high, k.low) + fewTimes.closedHours * f(P.high, aClosed.high, k.low)) / h) < 1e-9);
  assert.ok(indoorRange({ cOut: 100, windows: 'open', volumeM3: 30 }).high > few.high);
});

test('cfm and m3/h conversions, EPA 2/3 rule, DIY presets as ranges', () => {
  assert.equal(cfmToM3h(100), 169.9);
  assert.ok(Math.abs(m3hToCfm(cfmToM3h(237)) - 237) < 1e-9);
  assert.equal(epaCadrRule(150), 100);
  const cr = DIY_PRESETS.find((d) => d.key === 'cr4');
  assert.deepEqual([cr.low, cr.high], [370, 432]);
});

test('cadrNeeded plugged back gives indoor at or below target, floor 0', () => {
  for (const windows of ['closed', 'open', 'few']) {
    for (const target of [60, 15]) {
      const need = cadrNeeded({ cOut: 300, target, windows, volumeM3: 25 });
      assert.ok(need.low <= need.high);
      assert.ok(indoorRange({ cOut: 300, windows, volumeM3: 25, cadrM3h: need.high }).high <= target + 1e-9);
      assert.ok(indoorRange({ cOut: 300, windows, volumeM3: 25, cadrM3h: need.low }).low <= target + 1e-9);
    }
  }
  assert.deepEqual(cadrNeeded({ cOut: 10, target: 15, windows: 'open', volumeM3: 25 }), { low: 0, high: 0 });
});

test('bestAiringHours picks the cleanest consecutive pair in the next 24 h', () => {
  const series = Array.from({ length: 30 }, (_, i) => ({ time: `2026-11-04T${String(i % 24).padStart(2, '0')}:00`, pm25: 200 }));
  series[14].pm25 = 40; series[15].pm25 = 50; series[20].pm25 = 10; // 20 alone is lower but 21 is 200
  series[26].pm25 = 1; series[27].pm25 = 1; // beyond 24 h, ignored
  const best = bestAiringHours(series, 2);
  assert.equal(best.start, '2026-11-04T14:00');
  assert.equal(best.end, '2026-11-04T15:00');
  assert.equal(best.mean, 45);
  series[15].pm25 = null;
  assert.notEqual(bestAiringHours(series, 2).start, '2026-11-04T14:00');
});

test('bestAiringHours stays inside waking hours (06:00-21:00) unless told otherwise', () => {
  const series = Array.from({ length: 24 }, (_, i) => ({ time: `2026-11-04T${String(i).padStart(2, '0')}:00`, pm25: 200 }));
  series[2].pm25 = 5; series[3].pm25 = 5; // the cleanest pair is at night
  series[20].pm25 = 5; series[21].pm25 = 5; // 20:00-22:00 ends after 21:00
  series[15].pm25 = 50; series[16].pm25 = 60;
  assert.equal(bestAiringHours(series, 2).start, '2026-11-04T15:00');
  assert.equal(bestAiringHours(series, 2, { from: 0, to: 23 }).start, '2026-11-04T02:00');
});

test('formatRange and room size', () => {
  assert.equal(formatRange(12.4, 30.6), '12-31 ug/m3');
  assert.equal(formatRange(30, 12), '12-30 ug/m3');
  const r = roomSize({ length: 10, width: 10, height: 9, unit: 'ft' });
  assert.ok(Math.abs(r.areaSqFt - 100) < 1e-9);
  assert.ok(Math.abs(r.volumeM3 - 900 * 0.3048 ** 3) < 1e-9);
});

// Every number followed by ug/m3 in an indoor line must be part of a low-high range.
const BARE = /(?<![\d-])\d+(\.\d+)?\s*(ug|µg|μg)\/m/;
const RANGE = /\d+-\d+ ug\/m3/g;

test('no i18n string carries a hard-coded concentration; both languages have the same keys', () => {
  assert.deepEqual(Object.keys(STRINGS.hi).sort(), Object.keys(STRINGS.en).sort());
  for (const lang of ['en', 'hi']) {
    for (const key of Object.keys(STRINGS[lang])) {
      assert.doesNotMatch(t(lang, key), /\d\s*(ug|µg|μg)\/m/, `${lang}.${key}`);
    }
  }
});

test('the result card never shows an indoor estimate as a single number', () => {
  const hourly = Array.from({ length: 48 }, (_, i) => ({
    time: `2026-11-${i < 24 ? '04' : '05'}T${String(i % 24).padStart(2, '0')}:00`, pm25: 80 + 120 * Math.abs(Math.sin(i / 5)),
  }));
  const now = new Date('2026-11-04T03:40:00Z'); // 09:10 IST
  const purifiers = [{ type: 'none' }, { type: 'commercial', cadrM3h: 400 }, { type: 'diy', diy: 'cr4' }];
  for (const lang of ['en', 'hi']) {
    for (const windows of ['closed', 'open', 'few']) {
      for (const purifier of purifiers) {
        const r = buildResult({
          lang, placeName: 'Delhi', hourly, now, windows, purifier, who: ['child'], url: 'https://x',
          room: { length: 14, width: 16, height: 10, unit: 'ft' },
        });
        const indoorTexts = [
          ...r.blocks.flatMap((b) => b.lines.filter((l) => l.kind === 'indoor').map((l) => l.text)),
          ...r.blocks.flatMap((b) => (b.rows || []).flatMap((row) => [row.now, row.day])),
          r.shareText.replace(/PM2\.5\D{0,10}\d+ ug\/m3/, ''), // the outdoor value in the share text is not an estimate
        ];
        assert.ok(indoorTexts.length >= 7);
        for (const text of indoorTexts) {
          assert.match(text, RANGE, text);
          assert.doesNotMatch(text.replace(RANGE, ''), BARE, text);
        }
        for (const line of r.blocks.flatMap((b) => b.lines)) assert.doesNotMatch(line.text, /\{\w+\}/, line.text);
        if (purifier.type === 'diy') assert.ok(r.blocks.some((b) => b.id === 'safety'));
      }
    }
  }
});
