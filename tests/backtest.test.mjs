// Recomputes the Delhi backtest from evidence/backtest/days/*.csv and checks the README numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runBacktest, table } from '../evidence/backtest/backtest.mjs';

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('README backtest tables match a fresh run over the saved CSVs (the app now, and the first version)', () => {
  for (const opts of [{}, { anyHour: true }]) {
    for (const line of table(runBacktest(opts))) assert.ok(README.includes(line), `README is missing: ${line}`);
  }
});

test('the app beats the daytime mean and the morning habit on most days, every season', () => {
  const { seasons, all } = runBacktest();
  assert.equal(Object.keys(seasons).length, 4);
  for (const x of [...Object.values(seasons), all]) {
    assert.ok(x.meanApp < x.meanDaily && x.meanApp > x.meanBest);
    assert.ok(x.vsDaily.lowerDays / x.vsDaily.of > 0.8 && x.vsMorning.lowerDays / x.vsMorning.of > 0.8);
  }
  assert.ok(all.days >= 230);
});

test('the app no longer sends people to air the room at night; the README says what the first version did', () => {
  assert.equal(runBacktest().all.nightPicks, 0);
  const v1 = runBacktest({ anyHour: true }).all;
  assert.ok(v1.nightPicks > 0);
  assert.match(README, new RegExp(`${v1.nightPicks} of the ${v1.days} days`));
});
