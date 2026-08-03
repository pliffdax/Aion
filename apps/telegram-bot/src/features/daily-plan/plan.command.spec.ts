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
  assert.equal(
    apiCalls.some(
      call => call.method === 'sendMessage' && String(call.payload.text).includes('160'),
    ),
    true,
  );
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

test('keeps description editing in the selected item card', async () => {
  const userId = 987654322;
  const item = { ...plan.items[0]!, description: 'Старое описание' };
  let currentPlan: v1.TelegramDailyPlanDto = {
    ...plan,
    telegramUserId: String(userId),
    items: [item],
  };
  const apiCalls: { method: string; payload: Record<string, unknown> }[] = [];
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
  };
  bot.api.config.use(transformer);
  registerDailyPlanHandlers(bot, {
    getOrCreateDailyPlan: async () => currentPlan,
    updateDailyPlanItem: async (
      _userId: number,
      _date: string,
      _itemId: string,
      fields: { text?: string; description?: string | null; completed?: boolean },
    ) => {
      currentPlan = {
        ...currentPlan,
        items: [{ ...item, description: fields.description ?? null }],
      };
      return currentPlan;
    },
  } as unknown as AionApiClient);

  const callbackMessage = {
    message_id: 20,
    date: 0,
    chat: { id: userId, type: 'private' as const, first_name: 'Test' },
    text: 'management',
  };

  await bot.handleUpdate({
    update_id: 10,
    callback_query: {
      id: 'open-item',
      from: { id: userId, is_bot: false, first_name: 'Test' },
      chat_instance: 'test-chat',
      data: `daily-plan:item:${item.id}`,
      message: callbackMessage,
    },
  });
  await bot.handleUpdate({
    update_id: 11,
    callback_query: {
      id: 'edit-description',
      from: { id: userId, is_bot: false, first_name: 'Test' },
      chat_instance: 'test-chat',
      data: `daily-plan:description:${item.id}`,
      message: callbackMessage,
    },
  });

  assert.equal(
    apiCalls.some(
      call =>
        call.method === 'editMessageText' &&
        call.payload.message_id === 20 &&
        String(call.payload.text).includes('2000') &&
        String(call.payload.text).includes('не отображается'),
    ),
    true,
  );

  const callsBeforeDescription = apiCalls.length;
  await bot.handleUpdate({
    update_id: 12,
    message: {
      message_id: 21,
      date: 0,
      chat: { id: userId, type: 'private', first_name: 'Test' },
      from: { id: userId, is_bot: false, first_name: 'Test' },
      text: 'Новое актуальное описание',
    },
  });

  const descriptionCalls = apiCalls.slice(callsBeforeDescription);
  assert.equal(
    descriptionCalls.some(
      call =>
        call.method === 'editMessageText' &&
        call.payload.message_id === 20 &&
        String(call.payload.text).includes('Новое актуальное описание'),
    ),
    true,
  );
  assert.equal(
    descriptionCalls.some(call => call.method === 'sendMessage'),
    false,
  );
});
