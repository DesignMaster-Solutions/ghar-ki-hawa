// Recomputes the Delhi backtest from evidence/backtest/days/*.csv and checks the README numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runBacktest, table } from '../evidence/backtest/backtest.mjs';

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('README backtest table matches a fresh run over the saved CSVs', () => {
  for (const line of table(runBacktest())) assert.ok(README.includes(line), `README is missing: ${line}`);
});

test('the app beats the daytime mean and the morning habit on most days, every season', () => {
  const { seasons, all } = runBacktest();
  assert.equal(Object.keys(seasons).length, 4);
  for (const x of [...Object.values(seasons), all]) {
    assert.ok(x.meanApp < x.meanDaily && x.meanApp > x.meanBest);
    assert.ok(x.vsDaily.lowerDays / x.vsDaily.of > 0.8 && x.vsMorning.lowerDays / x.vsMorning.of > 0.8);
  }
  assert.ok(all.days >= 230);
  assert.match(README, new RegExp(`${all.nightPicks} of the ${all.days} days`));
});
