import assert from 'node:assert/strict';
import test from 'node:test';
import type { v1 } from '@aion/contracts';
import { Bot } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import { isTelegramMessageNotModified } from '../../core/telegram-errors.js';
import { registerStatisticsHandlers } from './statistics.command.js';
import {
  buildWeeklyStatisticsKeyboard,
  parseStatisticsDateInput,
  latestCompletedWeekStart,
  renderWeeklyStatistics,
  weekStartContainingDate,
  weeklyStatisticsPeriodEnd,
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

test('recognizes a harmless repeated Telegram panel edit', () => {
  assert.equal(
    isTelegramMessageNotModified({
      description: 'Bad Request: message is not modified: content is unchanged',
    }),
    true,
  );
  assert.equal(isTelegramMessageNotModified(new Error('network unavailable')), false);
});

test('renders weekly metrics and escapes task text', () => {
  const text = renderWeeklyStatistics(statistics);

  assert.match(text, /Статистика планов за неделю/);
  assert.match(text, /03\.08\.2026 — 09\.08\.2026/);
  assert.match(text, /Выполнено: <b>1\/2<\/b> \(50%\)/);
  assert.match(text, /Всего переносов: <b>3<\/b>/);
  assert.match(text, /2× Сложная &lt;задача&gt;/);
});

test('only offers a later week when it is already complete', () => {
  const latestCallbacks = callbacks(
    buildWeeklyStatisticsKeyboard('ru', '2026-08-03', '2026-08-03'),
  );
  assert.deepEqual(latestCallbacks, ['statistics:week:2026-07-27', 'statistics:date:2026-08-03']);

  const olderCallbacks = callbacks(buildWeeklyStatisticsKeyboard('ru', '2026-07-27', '2026-08-03'));
  assert.deepEqual(olderCallbacks, [
    'statistics:week:2026-07-20',
    'statistics:date:2026-07-27',
    'statistics:week:2026-08-03',
  ]);
  const distantKeyboard = buildWeeklyStatisticsKeyboard('ru', '2026-07-20', '2026-08-03');
  assert.deepEqual(callbacks(distantKeyboard), [
    'statistics:week:2026-07-13',
    'statistics:date:2026-07-20',
    'statistics:week:2026-07-27',
    'statistics:week:2026-08-03',
  ]);
  assert.equal(distantKeyboard.inline_keyboard[1]?.[0]?.text, '⏩ К последней неделе');
});

test('parses a selected calendar date and resolves its Monday', () => {
  assert.equal(parseStatisticsDateInput('22.07.2026'), '2026-07-22');
  assert.equal(parseStatisticsDateInput('2026-07-22'), '2026-07-22');
  assert.equal(parseStatisticsDateInput('31.02.2026'), null);
  assert.equal(weekStartContainingDate('2026-07-22'), '2026-07-20');
  assert.equal(weekStartContainingDate('2026-07-26'), '2026-07-20');
});

test('asks for a date, removes the input, and opens the containing week', async () => {
  const userId = 987654321;
  const apiCalls: { method: string; payload: Record<string, unknown> }[] = [];
  const requestedPeriods: string[] = [];
  const bot = new Bot('123456:test-token', {
    botInfo: {
      id: 123456,
      is_bot: true,
      first_name: 'Aion Test',
      username: 'aion_test_bot',
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
      has_topics_enabled: false,
      allows_users_to_create_topics: false,
      can_manage_bots: false,
      supports_join_request_queries: false,
    },
  });
  bot.api.config.use(async (_previous, method, payload) => {
    apiCalls.push({ method, payload: payload as Record<string, unknown> });

    if (method === 'editMessageText') {
      const messagePayload = payload as { message_id?: number; text?: string };
      return {
        ok: true,
        result: {
          message_id: Number(messagePayload.message_id),
          date: 0,
          chat: { id: userId, type: 'private', first_name: 'Test' },
          text: String(messagePayload.text),
        },
      } as never;
    }

    return { ok: true, result: true } as never;
  });
  registerStatisticsHandlers(bot, {
    getWeeklyPlanStatistics: async (_userId: number, periodStart: string) => {
      requestedPeriods.push(periodStart);
      return {
        ...statistics,
        telegramUserId: String(userId),
        periodStart,
        periodEnd: weeklyStatisticsPeriodEnd(periodStart),
      };
    },
  } as unknown as AionApiClient);
  const callbackMessage = {
    message_id: 50,
    date: 0,
    chat: { id: userId, type: 'private' as const, first_name: 'Test' },
    text: 'statistics',
  };

  await bot.handleUpdate({
    update_id: 1,
    callback_query: {
      id: 'choose-date',
      from: { id: userId, is_bot: false, first_name: 'Test' },
      chat_instance: 'test-chat',
      data: 'statistics:date:2026-07-27',
      message: callbackMessage,
    },
  });
  assert.equal(
    apiCalls.some(
      call => call.method === 'editMessageText' && String(call.payload.text).includes('ДД.ММ.ГГГГ'),
    ),
    true,
  );

  await bot.handleUpdate({
    update_id: 2,
    message: {
      message_id: 51,
      date: 0,
      chat: callbackMessage.chat,
      from: { id: userId, is_bot: false, first_name: 'Test' },
      text: '22.07.2026',
    },
  });

  assert.deepEqual(requestedPeriods, ['2026-07-20']);
  assert.equal(
    apiCalls.some(call => call.method === 'deleteMessage' && call.payload.message_id === 51),
    true,
  );
  assert.equal(
    apiCalls.some(
      call =>
        call.method === 'editMessageText' &&
        call.payload.message_id === 50 &&
        String(call.payload.text).includes('20.07.2026'),
    ),
    true,
  );
});

function callbacks(keyboard: ReturnType<typeof buildWeeklyStatisticsKeyboard>): string[] {
  return keyboard.inline_keyboard
    .flat()
    .flatMap(button => ('callback_data' in button ? [button.callback_data] : []));
}
