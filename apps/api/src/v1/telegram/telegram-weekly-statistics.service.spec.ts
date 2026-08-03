import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaService } from '@/prisma/prisma.service';
import { TelegramWeeklyStatisticsService } from './telegram-weekly-statistics.service';

test('counts task chains, completions, and carry events across a completed week', async () => {
  const monday = new Date('2026-08-03T00:00:00.000Z');
  const tuesday = new Date('2026-08-04T00:00:00.000Z');
  const wednesday = new Date('2026-08-05T00:00:00.000Z');
  const sunday = new Date('2026-08-09T00:00:00.000Z');
  const nextMonday = new Date('2026-08-10T00:00:00.000Z');
  const root = item('root-a', 'Главная задача', 0, false, null);
  const firstCarry = item('carry-a-1', 'Главная задача', 1, false, monday);
  const completed = item('carry-a-2', 'Главная задача', 2, true, tuesday);
  const sundayRoot = item('root-b', 'Незавершённая задача', 0, false, null);
  const outgoing = {
    ...item('carry-b-1', 'Незавершённая задача', 1, true, sunday),
    dailyPlan: { planDate: nextMonday },
  };
  const plans = [
    { planDate: monday, items: [root] },
    { planDate: tuesday, items: [firstCarry] },
    { planDate: wednesday, items: [completed] },
    { planDate: sunday, items: [sundayRoot] },
  ];
  const prisma = {
    telegramUser: {
      findUnique: async () => ({ id: 'user-1', telegramId: 123n, locale: 'RU' }),
    },
    dailyPlan: { findMany: async () => plans },
    dailyPlanItem: {
      findMany: async () => [
        { ...firstCarry, dailyPlan: { planDate: tuesday } },
        { ...completed, dailyPlan: { planDate: wednesday } },
        outgoing,
      ],
    },
  } as unknown as PrismaService;
  const service = new TelegramWeeklyStatisticsService(prisma);

  const result = await service.get({ telegramUserId: '123', periodStart: '2026-08-03' });

  assert.deepEqual(result, {
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
      { text: 'Главная задача', carryCount: 2, completed: true },
      { text: 'Незавершённая задача', carryCount: 1, completed: false },
    ],
  });
});

function item(
  id: string,
  text: string,
  carryCount: number,
  completed: boolean,
  sourceDate: Date | null,
) {
  return {
    id,
    text,
    carryCount,
    completed,
    carriedFromItem: sourceDate ? { dailyPlan: { planDate: sourceDate } } : null,
  };
}
