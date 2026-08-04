import assert from 'node:assert/strict';
import test from 'node:test';
import { v1 } from '@aion/contracts';
import { Bot } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import { translate } from '../../core/i18n/i18n.js';
import {
  currentKyivDateKey,
  parseDateKeyInput,
  shiftDateKey,
} from '../../core/time/kyiv-calendar.js';
import {
  buildPlanKeyboard,
  registerDailyPlanHandlers,
  renderManagement,
  renderPlan,
} from './plan.command.js';

const today = currentKyivDateKey();

const plan: v1.TelegramDailyPlanDto = {
  id: 'cm0000000000000000000000',
  telegramUserId: '123456789',
  date: today,
  items: [
    {
      id: 'cm0000000000000000000001',
      text: 'Короткий пункт',
      description: 'Подробности, которых не должно быть в общей панели',
      completed: false,
      completedAt: null,
      carryCount: 0,
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

test('hides completed items only in the main panel and offers a reversible action', () => {
  const completedItem: v1.TelegramDailyPlanItemDto = {
    id: 'cm0000000000000000000002',
    text: 'Уже выполнено',
    description: null,
    completed: true,
    completedAt: '2026-08-03T12:00:00.000Z',
    carryCount: 0,
    position: 1,
  };
  const planWithCompleted = { ...plan, items: [...plan.items, completedItem] };

  assert.match(renderPlan(planWithCompleted), /Уже выполнено/);
  assert.doesNotMatch(renderPlan(planWithCompleted, true), /Уже выполнено/);
  assert.match(renderManagement(planWithCompleted), /Уже выполнено/);

  const visibleKeyboard = JSON.stringify(buildPlanKeyboard(planWithCompleted));
  const hiddenKeyboard = JSON.stringify(buildPlanKeyboard(planWithCompleted, true));
  assert.match(visibleKeyboard, new RegExp(`dp:h:${today}`));
  assert.doesNotMatch(hiddenKeyboard, new RegExp(`dp:t:${today}:${completedItem.id}`));
  assert.match(hiddenKeyboard, new RegExp(`dp:s:${today}`));
  assert.match(hiddenKeyboard, /\(1\)/);
});

test('navigates across dates and keeps past plans read-only', () => {
  const tomorrow = shiftDateKey(today, 1);
  const yesterday = shiftDateKey(today, -1);
  const futurePlan = { ...plan, date: tomorrow };
  const pastPlan = { ...plan, date: yesterday };
  const futureKeyboard = JSON.stringify(buildPlanKeyboard(futurePlan));
  const pastKeyboard = JSON.stringify(buildPlanKeyboard(pastPlan));

  assert.match(renderPlan(futurePlan), /План на завтра/);
  assert.match(futureKeyboard, new RegExp(`dp:a:${tomorrow}`));
  assert.match(futureKeyboard, new RegExp(`dp:o:${today}`));
  assert.match(futureKeyboard, new RegExp(`dp:c:${tomorrow}`));

  assert.match(renderPlan(pastPlan), /только для просмотра/);
  assert.doesNotMatch(pastKeyboard, /dp:a:/);
  assert.doesNotMatch(pastKeyboard, /dp:t:/);
  assert.equal(
    buildPlanKeyboard(pastPlan).inline_keyboard.every(row => row.length > 0),
    true,
  );
});

test('parses exact plan dates and rejects impossible dates', () => {
  assert.equal(parseDateKeyInput('12.08.2026'), '2026-08-12');
  assert.equal(parseDateKeyInput('2026-8-12'), '2026-08-12');
  assert.equal(parseDateKeyInput('31.02.2026'), null);
});

test('renders the plan date prompt with the shared copyable format and example style', () => {
  const prompt = translate('ru', 'daily.datePrompt', { example: '12.08.2026' });

  assert.match(prompt, /<b>📅 Выбор даты плана<\/b>/);
  assert.match(prompt, /<code>ДД\.ММ\.ГГГГ<\/code>/);
  assert.match(prompt, /<code>12\.08\.2026<\/code>/);
});

test('adds a plan item to the date encoded in the opened panel', async () => {
  const userId = 987654324;
  const tomorrow = shiftDateKey(today, 1);
  const addedDates: string[] = [];
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
  bot.api.config.use(async (_previous, method, payload) => {
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
  });
  registerDailyPlanHandlers(bot, {
    getOrCreateDailyPlan: async (_userId: number, date: string) => ({
      ...plan,
      telegramUserId: String(userId),
      date,
      items: [],
    }),
    addDailyPlanItem: async (
      _userId: number,
      date: string,
      text: string,
    ): Promise<v1.TelegramDailyPlanDto> => {
      addedDates.push(date);
      return {
        ...plan,
        telegramUserId: String(userId),
        date,
        items: [{ ...plan.items[0]!, text, description: null }],
      };
    },
  } as unknown as AionApiClient);

  const panelMessage = {
    message_id: 10,
    date: 0,
    chat: { id: userId, type: 'private' as const, first_name: 'Test' },
    text: 'future plan panel',
  };
  await bot.handleUpdate({
    update_id: 30,
    callback_query: {
      id: 'add-future-item',
      from: { id: userId, is_bot: false, first_name: 'Test' },
      chat_instance: 'test-chat',
      data: `dp:a:${tomorrow}`,
      message: panelMessage,
    },
  });
  await bot.handleUpdate({
    update_id: 31,
    message: {
      message_id: 11,
      date: 0,
      chat: { id: userId, type: 'private', first_name: 'Test' },
      from: { id: userId, is_bot: false, first_name: 'Test' },
      text: 'Задача на завтра',
    },
  });
  await bot.handleUpdate({
    update_id: 32,
    callback_query: {
      id: 'without-description',
      from: { id: userId, is_bot: false, first_name: 'Test' },
      chat_instance: 'test-chat',
      data: 'daily-plan:add-without-description',
      message: { ...panelMessage, message_id: 100, text: 'description choice' },
    },
  });

  assert.deepEqual(addedDates, [tomorrow]);
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
  const oldResponse = v1.TelegramDailyPlanItemDtoSchema.parse({
    id: 'cm0000000000000000000001',
    text: 'Старый ответ API',
    completed: false,
    position: 0,
  });
  assert.equal(oldResponse.description, null);
  assert.equal(oldResponse.completedAt, null);
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

test('keeps hidden completed items in management and can return them to work', async () => {
  const userId = 987654323;
  const completedItem: v1.TelegramDailyPlanItemDto = {
    id: 'cm0000000000000000000002',
    text: 'Скрытая выполненная задача',
    description: null,
    completed: true,
    completedAt: '2026-08-03T12:00:00.000Z',
    carryCount: 0,
    position: 1,
  };
  let currentPlan: v1.TelegramDailyPlanDto = {
    ...plan,
    telegramUserId: String(userId),
    items: [{ ...plan.items[0]! }, completedItem],
  };
  let legacyClearCalls = 0;
  let nextMessageId = 200;
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
    getOrCreateDailyPlan: async () => currentPlan,
    clearCompletedDailyPlanItems: async () => {
      legacyClearCalls += 1;
      return currentPlan;
    },
    toggleDailyPlanItem: async (_userId: number, _date: string, itemId: string) => {
      currentPlan = {
        ...currentPlan,
        items: currentPlan.items.map(item =>
          item.id === itemId
            ? {
                ...item,
                completed: !item.completed,
                completedAt: item.completed ? null : '2026-08-03T13:00:00.000Z',
              }
            : item,
        ),
      };
      return currentPlan;
    },
  } as unknown as AionApiClient);

  const panelMessage = {
    message_id: 30,
    date: 0,
    chat: { id: userId, type: 'private' as const, first_name: 'Test' },
    text: 'plan panel',
  };

  await bot.handleUpdate({
    update_id: 20,
    callback_query: {
      id: 'hide-completed',
      from: { id: userId, is_bot: false, first_name: 'Test' },
      chat_instance: 'test-chat',
      data: 'daily-plan:hide-completed',
      message: panelMessage,
    },
  });

  assert.equal(legacyClearCalls, 0);
  assert.equal(
    apiCalls.some(
      call =>
        call.method === 'editMessageText' &&
        call.payload.message_id === 30 &&
        !String(call.payload.text).includes(completedItem.text),
    ),
    true,
  );

  await bot.handleUpdate({
    update_id: 21,
    callback_query: {
      id: 'manage',
      from: { id: userId, is_bot: false, first_name: 'Test' },
      chat_instance: 'test-chat',
      data: 'daily-plan:manage',
      message: panelMessage,
    },
  });

  assert.equal(
    apiCalls.some(
      call =>
        call.method === 'sendMessage' && String(call.payload.text).includes(completedItem.text),
    ),
    true,
  );

  const managementMessage = {
    message_id: 200,
    date: 0,
    chat: { id: userId, type: 'private' as const, first_name: 'Test' },
    text: 'management',
  };
  await bot.handleUpdate({
    update_id: 22,
    callback_query: {
      id: 'open-completed',
      from: { id: userId, is_bot: false, first_name: 'Test' },
      chat_instance: 'test-chat',
      data: `daily-plan:item:${completedItem.id}`,
      message: managementMessage,
    },
  });
  await bot.handleUpdate({
    update_id: 23,
    callback_query: {
      id: 'return-to-work',
      from: { id: userId, is_bot: false, first_name: 'Test' },
      chat_instance: 'test-chat',
      data: `daily-plan:manage-toggle:${completedItem.id}`,
      message: managementMessage,
    },
  });

  const restoredItem = currentPlan.items.find(item => item.id === completedItem.id);
  assert.equal(restoredItem?.completed, false);
  assert.equal(restoredItem?.completedAt, null);
  assert.equal(
    apiCalls.some(
      call =>
        call.method === 'editMessageText' &&
        call.payload.message_id === 30 &&
        String(call.payload.text).includes(completedItem.text),
    ),
    true,
  );
});
