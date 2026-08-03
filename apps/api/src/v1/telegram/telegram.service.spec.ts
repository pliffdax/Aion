import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaService } from '@/prisma/prisma.service';
import { TelegramService } from './telegram.service';

const dto = {
  telegramUserId: '123456789',
  date: '2026-08-03',
  itemId: 'cm0000000000000000000001',
};

function planFixture(completed: boolean, completedAt: Date | null) {
  const now = new Date('2026-08-03T10:00:00.000Z');
  const user = { id: 'user-1', telegramId: 123456789n };
  const item = {
    id: dto.itemId,
    dailyPlanId: 'plan-1',
    carriedFromItemId: null,
    text: 'Сохранить историю',
    description: null,
    completed,
    completedAt,
    position: 0,
    createdAt: now,
    updatedAt: now,
  };
  const plan = {
    id: 'plan-1',
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
    items: [item],
  };

  return { user, item, plan };
}

test('toggle stores and clears completedAt atomically with completed', async () => {
  const fixture = planFixture(false, null);
  const updates: Record<string, unknown>[] = [];
  const transaction = {
    dailyPlanItem: {
      findFirst: async () => fixture.item,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        Object.assign(fixture.item, data);
        return fixture.item;
      },
    },
    dailyPlan: {
      findUniqueOrThrow: async () => fixture.plan,
    },
  };
  const prisma = {
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) =>
      callback(transaction),
  } as unknown as PrismaService;
  const service = new TelegramService(prisma);

  const completedPlan = await service.toggleDailyPlanItem(dto);
  assert.equal(updates[0]?.completed, true);
  assert.equal(updates[0]?.completedAt instanceof Date, true);
  assert.equal(completedPlan.items[0]?.completed, true);
  assert.equal(typeof completedPlan.items[0]?.completedAt, 'string');

  const reopenedPlan = await service.toggleDailyPlanItem(dto);
  assert.deepEqual(updates[1], { completed: false, completedAt: null });
  assert.equal(reopenedPlan.items[0]?.completed, false);
  assert.equal(reopenedPlan.items[0]?.completedAt, null);
});

test('legacy clear-completed endpoint preserves completed records', async () => {
  const completedAt = new Date('2026-08-03T12:00:00.000Z');
  const fixture = planFixture(true, completedAt);
  let destructiveCallCount = 0;
  const prisma = {
    telegramUser: {
      upsert: async () => fixture.user,
    },
    dailyPlan: {
      upsert: async () => fixture.plan,
      findUniqueOrThrow: async () => fixture.plan,
    },
    dailyPlanItem: {
      deleteMany: async () => {
        destructiveCallCount += 1;
        return { count: 1 };
      },
    },
  } as unknown as PrismaService;
  const service = new TelegramService(prisma);

  const result = await service.clearCompletedDailyPlanItems(dto);

  assert.equal(destructiveCallCount, 0);
  assert.equal(fixture.plan.items.length, 1);
  assert.equal(result.items[0]?.completed, true);
  assert.equal(result.items[0]?.completedAt, completedAt.toISOString());
});
