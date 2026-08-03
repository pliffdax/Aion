import assert from 'node:assert/strict';
import test from 'node:test';
import { v1 } from '@aion/contracts';
import { Bot } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import { registerDailyPlanHandlers, renderManagement, renderPlan } from './plan.command.js';

const plan: v1.TelegramDailyPlanDto = {
  id: 'cm0000000000000000000000',
  telegramUserId: '123456789',
  date: '2026-08-03',
  items: [
    {
      id: 'cm0000000000000000000001',
      text: 'Короткий пункт',
      description: 'Подробности, которых не должно быть в общей панели',
      completed: false,
      position: 0,
    },
  ],
};

test('keeps descriptions out of the main daily plan panel', () => {
  const rendered = renderPlan(plan);

  assert.match(rendered, /Короткий пункт/);
  assert.doesNotMatch(rendered, /Подробности/);
});

test('marks described items in the management panel without rendering description text', () => {
  const rendered = renderManagement(plan);

  assert.match(rendered, /Короткий пункт 📝/);
  assert.doesNotMatch(rendered, /Подробности/);
});

test('validates optional daily plan descriptions at the API boundary', () => {
  const baseItem = {
    telegramUserId: '123456789',
    date: '2026-08-03',
    text: 'Короткий пункт',
  };

  assert.equal(
    v1.AddTelegramDailyPlanItemDtoSchema.parse({ ...baseItem, description: ' Детали ' })
      .description,
    'Детали',
  );
  assert.equal(
    v1.AddTelegramDailyPlanItemDtoSchema.safeParse({
      ...baseItem,
      description: 'д'.repeat(2001),
    }).success,
    false,
  );
  assert.equal(
    v1.UpdateTelegramDailyPlanItemDtoSchema.safeParse({
      telegramUserId: '123456789',
      date: '2026-08-03',
      itemId: 'cm0000000000000000000001',
      description: null,
    }).success,
    true,
  );
  assert.equal(
    v1.TelegramDailyPlanItemDtoSchema.parse({
      id: 'cm0000000000000000000001',
      text: 'Старый ответ API',
      completed: false,
      position: 0,
    }).description,
    null,
  );
});

test('deletes an oversized item message and reuses the existing prompt', async () => {
  const userId = 987654321;
  const apiCalls: { method: string; payload: Record<string, unknown> }[] = [];
  let nextMessageId = 100;
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
  const transformer: Parameters<typeof bot.api.config.use>[0] = async (
    _previous,
    method,
    payload,
  ) => {
    apiCalls.push({ method, payload: payload as Record<string, unknown> });

    if (method === 'sendMessage' || method === 'editMessageText') {
      const messagePayload = payload as { message_id?: number; text?: string };
      return {
        ok: true,
        result: {
          message_id:
            method === 'sendMessage' ? nextMessageId++ : Number(messagePayload.message_id),
          date: 0,
          chat: { id: userId, type: 'private', first_name: 'Test' },
          text: String(messagePayload.text),
        },
      } as never;
    }

    return { ok: true, result: true } as never;
  };
  bot.api.config.use(transformer);
  registerDailyPlanHandlers(bot, {
    getOrCreateDailyPlan: async () => ({ ...plan, telegramUserId: String(userId), items: [] }),
  } as unknown as AionApiClient);

  await bot.handleUpdate({
    update_id: 1,
    callback_query: {
      id: 'add-item',
      from: { id: userId, is_bot: false, first_name: 'Test' },
      chat_instance: 'test-chat',
      data: 'daily-plan:add',
      message: {
        message_id: 10,
        date: 0,
        chat: { id: userId, type: 'private', first_name: 'Test' },
        text: 'plan panel',
      },
    },
  });
  const promptMessageId = 100;
  const callsBeforeInvalidInput = apiCalls.length;

  await bot.handleUpdate({
    update_id: 2,
    message: {
      message_id: 11,
      date: 0,
      chat: { id: userId, type: 'private', first_name: 'Test' },
      from: { id: userId, is_bot: false, first_name: 'Test' },
      text: 'x'.repeat(161),
    },
  });

  const invalidInputCalls = apiCalls.slice(callsBeforeInvalidInput);
  assert.equal(
    invalidInputCalls.some(call => call.method === 'sendMessage'),
    false,
  );
  assert.equal(
    invalidInputCalls.some(
      call => call.method === 'deleteMessage' && call.payload.message_id === 11,
    ),
    true,
  );
  assert.equal(
    invalidInputCalls.some(
      call =>
        call.method === 'editMessageText' &&
        call.payload.message_id === promptMessageId &&
        String(call.payload.text).includes('160'),
    ),
    true,
  );
});
