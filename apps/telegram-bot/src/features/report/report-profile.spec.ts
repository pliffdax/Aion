import assert from 'node:assert/strict';
import test from 'node:test';
import { reportStartDateFromWeekDay } from './report-profile.js';

test('derives the start date from the current report week and day', () => {
  assert.equal(reportStartDateFromWeekDay('1 1', '2026-08-02'), '2026-08-02');
  assert.equal(reportStartDateFromWeekDay('2 3', '2026-08-02'), '2026-07-24');
  assert.equal(reportStartDateFromWeekDay('Неделя 12, день 4', '2026-08-02'), '2026-05-14');
});

test('rejects invalid report week and day input', () => {
  assert.equal(reportStartDateFromWeekDay('0 1', '2026-08-02'), null);
  assert.equal(reportStartDateFromWeekDay('-1 1', '2026-08-02'), null);
  assert.equal(reportStartDateFromWeekDay('1 8', '2026-08-02'), null);
  assert.equal(reportStartDateFromWeekDay('week twelve', '2026-08-02'), null);
  assert.equal(reportStartDateFromWeekDay('10000 1', '2026-08-02'), null);
});
