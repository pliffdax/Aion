import assert from 'node:assert/strict';
import test from 'node:test';
import type { v1 } from '@aion/contracts';
import { Bot } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import { command, registerReportHandlers } from './report.command.js';

test('opens report editing from history and removes the panel on cancel', async () => {
  const userId = 987654322;
  const messageId = 50;
  const apiCalls: { method: string; payload: Record<string, unknown> }[] = [];
  const report = editableDailyReport(userId);
  const apiClient = {
    upsertTelegramUser: async () => ({
      id: 'user1',
      telegramUserId: String(userId),
      username: 'tester',
      firstName: 'Test',
      locale: 'ru' as const,
      reportAuthorName: 'Test User',
      reportStartDate: '2026-08-03',
      reportDailySections: report.configuration,
      reportWeeklySections: [field('weekly-summary', 'Итог недели', 'text')],
    }),
    listReportHistory: async () => ({ items: [report], nextCursor: null }),
    getReportHistoryItem: async () => report,
    findEditableReport: async () => report,
  } as unknown as AionApiClient;
  const bot = testBot(userId, apiCalls);
  registerReportHandlers(bot, apiClient);

  await command.handle(
    {
      from: { id: userId, is_bot: false, first_name: 'Test', username: 'tester' },
      api: bot.api,
      reply: async (text: string, options: object) => {
        await bot.api.sendMessage(userId, text, options);
        return {
          message_id: messageId,
          date: 0,
          chat: { id: userId, type: 'private', first_name: 'Test' },
          text,
        };
      },
    } as never,
    [],
  );

  await callback(bot, userId, messageId, 1, 'report:menu:history');
  const historyEdits = countMethod(apiCalls, 'editMessageText');
  await callback(bot, userId, messageId, 2, 'report:history:filter:all');
  assert.equal(countMethod(apiCalls, 'editMessageText'), historyEdits);

  await callback(bot, userId, messageId, 3, `report:history:item:${report.id}`);
  await callback(bot, userId, messageId, 4, 'report:history:edit');

  const collectorEdit = [...apiCalls]
    .reverse()
    .find(
      call =>
        call.method === 'editMessageText' && String(call.payload.text).includes('Сохранённый итог'),
    );
  assert.ok(collectorEdit);
  assert.equal(String(collectorEdit.payload.text).includes('Итог дня'), true);

  await callback(bot, userId, messageId, 5, 'report:cancel');
  assert.equal(
    apiCalls.some(call => call.method === 'deleteMessage' && call.payload.message_id === messageId),
    true,
  );
  assert.equal(
    apiCalls.some(
      call =>
        call.method === 'editMessageText' && String(call.payload.text) === 'Сбор отчёта отменён.',
    ),
    false,
  );
});

function countMethod(
  apiCalls: { method: string; payload: Record<string, unknown> }[],
  method: string,
): number {
  return apiCalls.filter(call => call.method === method).length;
}

function testBot(
  userId: number,
  apiCalls: { method: string; payload: Record<string, unknown> }[],
): Bot {
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

    if (method === 'sendMessage' || method === 'editMessageText') {
      const messagePayload = payload as { message_id?: number; text?: string };
      return {
        ok: true,
        result: {
          message_id: method === 'sendMessage' ? 50 : Number(messagePayload.message_id),
          date: 0,
          chat: { id: userId, type: 'private', first_name: 'Test' },
          text: String(messagePayload.text),
        },
      } as never;
    }

    return { ok: true, result: true } as never;
  });
  return bot;
}

async function callback(
  bot: Bot,
  userId: number,
  messageId: number,
  updateId: number,
  data: string,
): Promise<void> {
  await bot.handleUpdate({
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
      from: { id: userId, is_bot: false, first_name: 'Test' },
      chat_instance: 'test-chat',
      data,
      message: {
        message_id: messageId,
        date: 0,
        chat: { id: userId, type: 'private', first_name: 'Test' },
        text: 'report panel',
      },
    },
  });
}

function editableDailyReport(userId: number): v1.EditableTelegramReportDto {
  return {
    id: 'report1',
    telegramUserId: String(userId),
    type: 'daily',
    periodStart: '2026-08-03',
    periodEnd: '2026-08-03',
    text: 'Saved report',
    createdAt: '2026-08-03T20:00:00.000Z',
    sentAt: '2026-08-03T20:00:01.000Z',
    answers: {
      summary: {
        text: 'Сохранённый итог',
        items: [],
        rating: null,
        boolean: null,
      },
    },
    configuration: [field('summary', 'Итог дня', 'text')],
    revision: 1,
    telegramMessageId: '77',
  };
}

function field(
  id: string,
  title: string,
  inputType: 'text' | 'list' | 'rating' | 'boolean',
): v1.TelegramReportField {
  return { id, title, prompt: '', inputType, listStyle: null, required: true };
}
