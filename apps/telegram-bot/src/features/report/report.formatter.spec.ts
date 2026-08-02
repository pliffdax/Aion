import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDailyReport } from './report.formatter.js';

test('formats only enabled daily sections and preserves their order', () => {
  const report = formatDailyReport(
    {
      priorities: [{ id: 1, text: 'Закрыть задачу', status: 'completed' }],
      event: 'Встреча',
      conclusion: 'Полезный день',
      tomorrow: [{ id: 2, text: 'Не должно попасть', status: 'pending' }],
      rating: 8,
    },
    { date: '2026-08-02', week: 3, day: 2 },
    '#TestUser',
    ['daily-rating', 'daily-priorities', 'daily-conclusion'],
  );

  assert.ok(report.indexOf('Счастье: 8/10') < report.indexOf('Приоритет дня'));
  assert.ok(report.indexOf('Приоритет дня') < report.indexOf('Вывод дня'));
  assert.doesNotMatch(report, /Событие дня/);
  assert.doesNotMatch(report, /Главные задачи на завтра/);
  assert.doesNotMatch(report, /Не должно попасть/);
});
