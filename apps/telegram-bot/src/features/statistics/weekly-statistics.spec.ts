import assert from 'node:assert/strict';
import test from 'node:test';
import type { v1 } from '@aion/contracts';
import {
  buildWeeklyStatisticsKeyboard,
  latestCompletedWeekStart,
  renderWeeklyStatistics,
} from './weekly-statistics.js';

const statistics: v1.TelegramWeeklyPlanStatisticsDto = {
  telegramUserId: '123',
  locale: 'ru',
  periodStart: '2026-08-03',
  periodEnd: '2026-08-09',
  taskCount: 2,
  completedCount: 1,
  unfinishedCount: 1,
  carryEventCount: 3,
  completionRate: 50,
  mostCarriedItems: [
    { text: 'Сложная <задача>', carryCount: 2, completed: true },
    { text: 'Перенести дальше', carryCount: 1, completed: false },
  ],
};

test('finds the latest fully completed Monday-to-Sunday week', () => {
  assert.equal(latestCompletedWeekStart('2026-08-10'), '2026-08-03');
  assert.equal(latestCompletedWeekStart('2026-08-13'), '2026-08-03');
  assert.equal(latestCompletedWeekStart('2026-08-09'), '2026-07-27');
});

test('renders weekly metrics and escapes task text', () => {
  const text = renderWeeklyStatistics(statistics);

  assert.match(text, /Выполнено: <b>1\/2<\/b> \(50%\)/);
  assert.match(text, /Всего переносов: <b>3<\/b>/);
  assert.match(text, /2× Сложная &lt;задача&gt;/);
});

test('only offers a later week when it is already complete', () => {
  const latestCallbacks = callbacks(
    buildWeeklyStatisticsKeyboard('ru', '2026-08-03', '2026-08-03'),
  );
  assert.deepEqual(latestCallbacks, ['statistics:week:2026-07-27']);

  const olderCallbacks = callbacks(buildWeeklyStatisticsKeyboard('ru', '2026-07-27', '2026-08-03'));
  assert.deepEqual(olderCallbacks, ['statistics:week:2026-07-20', 'statistics:week:2026-08-03']);
});

function callbacks(keyboard: ReturnType<typeof buildWeeklyStatisticsKeyboard>): string[] {
  return keyboard.inline_keyboard
    .flat()
    .flatMap(button => ('callback_data' in button ? [button.callback_data] : []));
}
