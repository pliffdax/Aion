import assert from 'node:assert/strict';
import test from 'node:test';
import type { v1 } from '@aion/contracts';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import { processCurrentRollover } from './daily-plan-rollover.js';

test('starts weekly statistics only after the daily rollover is delivered and completed', async () => {
  const events: string[] = [];
  const plan: v1.TelegramDailyPlanDto = {
    id: 'plan-1',
    telegramUserId: '123',
    date: '2026-08-02',
    items: [
      {
        id: 'item-1',
        text: 'Задача',
        description: null,
        completed: true,
        completedAt: '2026-08-02T12:00:00.000Z',
        carryCount: 0,
        position: 0,
      },
    ],
  };
  const claim: v1.ClaimedTelegramDailyPlanRolloverDto = {
    sourcePlan: plan,
    targetPlan: { ...plan, id: 'plan-2', date: '2026-08-03', items: [] },
    locale: 'ru',
    deliveryToken: 'ec7fda38-8f0f-4ae8-b573-5746f53db7a0',
  };
  const apiClient = {
    claimDailyPlanRollovers: async () => {
      events.push('claim-rollover');
      return [claim];
    },
    completeDailyPlanRollover: async () => {
      events.push('complete-rollover');
      return { ok: true as const };
    },
    listWeeklyPlanStatisticsCandidates: async () => {
      events.push('list-statistics');
      return { items: [], nextCursor: null };
    },
  } as unknown as AionApiClient;
  let messageId = 0;
  const telegramApi = {
    sendMessage: async () => {
      events.push('send-rollover');
      messageId += 1;
      return { message_id: messageId, chat: { id: 123 } };
    },
  } as never;

  const result = await processCurrentRollover(telegramApi, apiClient);

  assert.deepEqual(events, [
    'claim-rollover',
    'send-rollover',
    'send-rollover',
    'complete-rollover',
    'list-statistics',
  ]);
  assert.equal(result.hadFailure, false);
});
