// Field check: the model against PM2.5 measured inside and outside 8 Delhi homes.
// Kulshreshtha P., Khare M., Atmospheric Pollution Research 2 (2011) 337-350, Table 5 (mean I/O
// ratios, GRIMM 1.107 monitors in the kitchen and outside, 10:00-16:00, 3 days a week per season).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indoorRange, SOURCES } from '../model.js';
import { STRINGS } from '../i18n.js';

const SUMMER = { 'LIG 1': 0.85, 'LIG 2': 0.97, 'LIG 3': 0.78, MIG: 0.82, HIG: 0.71, 'LIG-IITD': 0.87, 'MIG-IITD': 1.8, 'HIG-IITD': 0.83 };
const WINTER = { 'LIG 1': 5.64, 'LIG 2': 1.13, 'LIG 3': 2.48, MIG: 0.87, HIG: 3.52, 'LIG-IITD': 1.3, 'MIG-IITD': 1.96, 'HIG-IITD': 2.05 };
// The authors tie MIG-IITD's summer 1.80 to an indoor source (children home on vacation).
const SUMMER_INDOOR_SOURCE = ['MIG-IITD'];

const ratio = (windows) => {
  const { low, high } = indoorRange({ cOut: 100, windows, volumeM3: 30 });
  return { low: low / 100, high: high / 100 };
};

test('summer: every home without an indoor source sits inside the windows-open range', () => {
  // Table 2 rates summer ventilation "Good" to "Excellent" (32-100 cfm/person): compare with "open".
  const { low, high } = ratio('open');
  for (const [home, io] of Object.entries(SUMMER)) {
    if (SUMMER_INDOOR_SOURCE.includes(home)) continue;
    assert.ok(io >= low && io <= high, `${home}: measured ${io}, model ${low.toFixed(2)}-${high.toFixed(2)}`);
  }
});

test('winter: indoor smoke beats the no-source model, so the screen must say how much', () => {
  for (const w of ['closed', 'open', 'few']) assert.ok(ratio(w).high < 1, `${w} can never pass 1 without a source`);
  const above = Object.values(WINTER).filter((io) => io > 1);
  assert.equal(above.length, 7);
  assert.equal(Math.max(...above), 5.64);
  for (const lang of Object.keys(STRINGS)) assert.match(STRINGS[lang].how_not, /5\.6/, `how_not (${lang}) states the measured 5.6x`);
  assert.match(SOURCES.kulshreshtha.url, /10\.5094\/APR\.2011\.038/);
});
