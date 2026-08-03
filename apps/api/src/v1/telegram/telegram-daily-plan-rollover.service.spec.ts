import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaService } from '@/prisma/prisma.service';
import { TelegramDailyPlanRolloverService } from './telegram-daily-plan-rollover.service';

test('rollover preserves source history and creates fresh incomplete items', async () => {
  const now = new Date('2026-08-03T12:00:00.000Z');
  const user = { id: 'user-1', telegramId: 123456789n, locale: 'RU' };
  const completedItem = {
    id: 'completed-1',
    dailyPlanId: 'source-plan',
    carriedFromItemId: null,
    text: 'Уже выполнено',
    description: null,
    completed: true,
    completedAt: now,
    carryCount: 0,
    position: 0,
    createdAt: now,
    updatedAt: now,
  };
  const incompleteItem = {
    ...completedItem,
    id: 'incomplete-1',
    text: 'Перенести дальше',
    completed: false,
    completedAt: null,
    carryCount: 2,
    position: 1,
  };
  const sourcePlan = {
    id: 'source-plan',
    userId: user.id,
    planDate: new Date('2026-08-03T00:00:00.000Z'),
    finalizedAt: null,
    rolloverCompletedAt: null,
    rolloverToken: null,
    rolloverClaimedAt: null,
    rolloverAttemptCount: 0,
    rolloverLastError: null,
    createdAt: now,
    updatedAt: now,
    user,
    items: [completedItem, incompleteItem],
  };
  const targetPlan = {
    ...sourcePlan,
    id: 'target-plan',
    planDate: new Date('2026-08-04T00:00:00.000Z'),
    items: [] as typeof sourcePlan.items,
  };
  let carriedData: Record<string, unknown>[] = [];
  const transaction = {
    dailyPlan: {
      updateMany: async ({ where }: { where: { id?: string } }) => ({
        count: where.id === sourcePlan.id ? 1 : 0,
      }),
      findFirst: async () => sourcePlan,
      upsert: async () => targetPlan,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) =>
        where.id === sourcePlan.id ? sourcePlan : targetPlan,
    },
    dailyPlanItem: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        carriedData = data;
        targetPlan.items.push(
          ...data.map((item, index) => ({
            ...incompleteItem,
            ...item,
            id: `carried-${index}`,
            createdAt: now,
            updatedAt: now,
          })),
        );
        return { count: data.length };
      },
    },
  };
  const prisma = {
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) =>
      callback(transaction),
  } as unknown as PrismaService;
  const service = new TelegramDailyPlanRolloverService(prisma);

  const claims = await service.claim({
    sourceDate: '2026-08-03',
    targetDate: '2026-08-04',
    limit: 1,
  });

  assert.equal(sourcePlan.items.length, 2);
  assert.equal(sourcePlan.items[0], completedItem);
  assert.equal(carriedData.length, 1);
  assert.equal(carriedData[0]?.carriedFromItemId, incompleteItem.id);
  assert.equal(carriedData[0]?.completed, false);
  assert.equal(carriedData[0]?.completedAt, null);
  assert.equal(carriedData[0]?.carryCount, 3);
  assert.equal(claims[0]?.sourcePlan.items.length, 2);
  assert.equal(claims[0]?.targetPlan.items[0]?.completed, false);
  assert.equal(claims[0]?.targetPlan.items[0]?.completedAt, null);
  assert.equal(claims[0]?.targetPlan.items[0]?.carryCount, 3);
});
