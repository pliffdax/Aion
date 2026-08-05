import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { v1 } from '@aion/contracts';
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

test('move contract requires a different target date', () => {
  const result = v1.MoveTelegramDailyPlanItemDtoSchema.safeParse({
    telegramUserId: dto.telegramUserId,
    date: '2099-08-03',
    itemId: dto.itemId,
    targetDate: '2099-08-03',
  });

  assert.equal(result.success, false);
});

test('moves an incomplete item atomically and preserves its identity and content', async () => {
  const sourceDate = '2099-08-03';
  const targetDate = '2099-08-04';
  const now = new Date('2099-08-03T10:00:00.000Z');
  const user = { id: 'user-1', telegramId: 123456789n };
  const item = {
    id: dto.itemId,
    dailyPlanId: 'source-plan',
    carriedFromItemId: null,
    text: 'Перенести задачу',
    description: 'Сохранить описание',
    completed: false,
    completedAt: null,
    carryCount: 2,
    position: 0,
    createdAt: now,
    updatedAt: now,
  };
  const sourcePlan = dailyPlanRecord('source-plan', sourceDate, user, [item], now);
  const existingTargetItem = {
    ...item,
    id: 'existing-item',
    dailyPlanId: 'target-plan',
    text: 'Уже запланировано',
    description: null,
    carryCount: 0,
    position: 3,
  };
  const targetItems: Array<typeof item | typeof existingTargetItem> = [existingTargetItem];
  const targetPlan = dailyPlanRecord('target-plan', targetDate, user, targetItems, now);
  const transaction = {
    telegramUser: {
      upsert: async () => user,
    },
    dailyPlan: {
      upsert: async () => targetPlan,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) =>
        where.id === sourcePlan.id ? sourcePlan : targetPlan,
    },
    dailyPlanItem: {
      findFirst: async () => item,
      aggregate: async () => ({ _count: targetPlan.items.length, _max: { position: 3 } }),
      update: async ({ data }: { data: { dailyPlanId: string; position: number } }) => {
        sourcePlan.items = sourcePlan.items.filter(candidate => candidate.id !== item.id);
        Object.assign(item, data);
        targetPlan.items.push(item);
        return item;
      },
    },
  };
  const prisma = {
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) =>
      callback(transaction),
  } as unknown as PrismaService;
  const service = new TelegramService(prisma);

  const result = await service.moveDailyPlanItem({
    telegramUserId: dto.telegramUserId,
    date: sourceDate,
    itemId: dto.itemId,
    targetDate,
  });

  assert.equal(result.sourcePlan.items.length, 0);
  assert.equal(result.targetPlan.items[1]?.id, item.id);
  assert.equal(result.targetPlan.items[1]?.text, item.text);
  assert.equal(result.targetPlan.items[1]?.description, item.description);
  assert.equal(result.targetPlan.items[1]?.carryCount, 2);
  assert.equal(result.targetPlan.items[1]?.position, 4);
  assert.equal(result.targetPlan.items[1]?.completed, false);
});

test('rejects moving completed items without changing their plan', async () => {
  const completedAt = new Date('2099-08-03T12:00:00.000Z');
  const fixture = planFixture(true, completedAt);
  let updateCalls = 0;
  const transaction = {
    dailyPlanItem: {
      findFirst: async () => fixture.item,
      update: async () => {
        updateCalls += 1;
      },
    },
  };
  const prisma = {
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) =>
      callback(transaction),
  } as unknown as PrismaService;
  const service = new TelegramService(prisma);

  await assert.rejects(
    service.moveDailyPlanItem({
      telegramUserId: dto.telegramUserId,
      date: '2099-08-03',
      itemId: dto.itemId,
      targetDate: '2099-08-04',
    }),
    ConflictException,
  );
  assert.equal(updateCalls, 0);
});

test('keeps the source item in place when the target plan is full', async () => {
  const fixture = planFixture(false, null);
  const targetPlan = { ...fixture.plan, id: 'target-plan', items: [] };
  let updateCalls = 0;
  const transaction = {
    telegramUser: {
      upsert: async () => fixture.user,
    },
    dailyPlan: {
      upsert: async () => targetPlan,
    },
    dailyPlanItem: {
      findFirst: async () => fixture.item,
      aggregate: async () => ({ _count: 20, _max: { position: 19 } }),
      update: async () => {
        updateCalls += 1;
      },
    },
  };
  const prisma = {
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) =>
      callback(transaction),
  } as unknown as PrismaService;
  const service = new TelegramService(prisma);

  await assert.rejects(
    service.moveDailyPlanItem({
      telegramUserId: dto.telegramUserId,
      date: '2099-08-03',
      itemId: dto.itemId,
      targetDate: '2099-08-04',
    }),
    BadRequestException,
  );
  assert.equal(updateCalls, 0);
  assert.equal(fixture.item.dailyPlanId, fixture.plan.id);
});

test('rejects moving items to past dates before opening a transaction', async () => {
  let transactionCalls = 0;
  const prisma = {
    $transaction: async () => {
      transactionCalls += 1;
    },
  } as unknown as PrismaService;
  const service = new TelegramService(prisma);

  await assert.rejects(
    service.moveDailyPlanItem({
      telegramUserId: dto.telegramUserId,
      date: '2099-08-03',
      itemId: dto.itemId,
      targetDate: '2020-01-01',
    }),
    BadRequestException,
  );
  assert.equal(transactionCalls, 0);
});

function dailyPlanRecord<TItem>(
  id: string,
  date: string,
  user: { id: string; telegramId: bigint },
  items: TItem[],
  now: Date,
) {
  return {
    id,
    userId: user.id,
    planDate: new Date(`${date}T00:00:00.000Z`),
    finalizedAt: null,
    rolloverCompletedAt: null,
    rolloverToken: null,
    rolloverClaimedAt: null,
    rolloverAttemptCount: 0,
    rolloverLastError: null,
    createdAt: now,
    updatedAt: now,
    user,
    items,
  };
}
