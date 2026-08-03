import assert from 'node:assert/strict';
import test from 'node:test';
import { v1 } from '@aion/contracts';
import {
  buildReportHistoryItemKeyboard,
  buildReportHistoryKeyboard,
  buildReportMenuKeyboard,
  renderReportHistory,
} from './report.view.js';

const dailyReport: v1.TelegramReportDto = {
  id: 'daily-report',
  telegramUserId: '123',
  type: 'daily',
  periodStart: '2026-08-03',
  periodEnd: '2026-08-03',
  text: '<b>03.08.2026</b>\nReport',
  createdAt: '2026-08-03T20:00:00.000Z',
  sentAt: '2026-08-03T20:00:01.000Z',
};

test('report menu and history keyboards provide complete forward and back navigation', () => {
  assert.ok(callbacks(buildReportMenuKeyboard('ru')).includes('report:menu:history'));

  const historyCallbacks = callbacks(
    buildReportHistoryKeyboard('ru', [dailyReport], {
      type: null,
      hasPrevious: true,
      hasNext: true,
    }),
  );
  assert.ok(historyCallbacks.includes('report:history:item:daily-report'));
  assert.ok(historyCallbacks.includes('report:history:previous'));
  assert.ok(historyCallbacks.includes('report:history:next'));
  assert.ok(historyCallbacks.includes('report:history:menu'));
  assert.ok(historyCallbacks.includes('report:history:filter:weekly_statistics'));
  assert.deepEqual(callbacks(buildReportHistoryItemKeyboard('ru')), [
    'report:history:list',
    'report:setup:cancel',
  ]);
});

test('history makes the migration boundary and selected filter explicit', () => {
  assert.match(renderReportHistory('ru', 'daily', [dailyReport]), /Фильтр: <b>Дневной<\/b>/);
  assert.match(renderReportHistory('ru', null, []), /только с момента обновления/);
  assert.match(renderReportHistory('ru', 'weekly_statistics', []), /Статистика/);
});

test('report history contracts validate exact periods, pagination, and claim outcomes', () => {
  assert.equal(
    v1.ClaimTelegramReportDeliveryDtoSchema.safeParse({
      telegramUserId: '123',
      type: 'weekly',
      periodStart: '2026-08-02',
      periodEnd: '2026-08-08',
      text: 'Report',
    }).success,
    true,
  );
  assert.equal(
    v1.ClaimTelegramReportDeliveryDtoSchema.safeParse({
      telegramUserId: '123',
      type: 'weekly',
      periodStart: '2026-08-02',
      periodEnd: '2026-08-09',
      text: 'Report',
    }).success,
    false,
  );
  assert.equal(
    v1.ClaimTelegramReportDeliveryDtoSchema.safeParse({
      telegramUserId: '123',
      type: 'weekly_statistics',
      periodStart: '2026-08-03',
      periodEnd: '2026-08-09',
      text: 'Statistics',
    }).success,
    true,
  );
  assert.equal(
    v1.ClaimedTelegramReportDeliveryDtoSchema.safeParse({
      reportId: 'report-1',
      outcome: 'busy',
      deliveryToken: 'not-allowed-for-busy',
    }).success,
    false,
  );
  assert.deepEqual(
    v1.TelegramReportHistoryPageDtoSchema.parse({
      items: [dailyReport],
      nextCursor: null,
    }).items,
    [dailyReport],
  );
});

function callbacks(keyboard: ReturnType<typeof buildReportMenuKeyboard>): string[] {
  return keyboard.inline_keyboard
    .flat()
    .flatMap(button => ('callback_data' in button ? [button.callback_data] : []));
}
