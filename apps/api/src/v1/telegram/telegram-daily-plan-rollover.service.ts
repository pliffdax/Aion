import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { v1 } from '@aion/contracts';
import { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

const claimLeaseMs = 5 * 60_000;
const retryDelayMs = 60_000;
const planWithItems = {
  include: {
    user: true,
    items: {
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    },
  },
} satisfies Prisma.DailyPlanDefaultArgs;

type DailyPlanRecord = Prisma.DailyPlanGetPayload<typeof planWithItems>;
type DatabaseClient = Pick<Prisma.TransactionClient, 'dailyPlan' | 'dailyPlanItem'>;

interface ClaimedRollover {
  sourcePlan: DailyPlanRecord;
  targetPlan: DailyPlanRecord;
  deliveryToken: string;
}

@Injectable()
export class TelegramDailyPlanRolloverService {
  constructor(private readonly prisma: PrismaService) {}

  async claim(
    dto: v1.ClaimTelegramDailyPlanRolloversDto,
  ): Promise<v1.ClaimedTelegramDailyPlanRolloverListDto> {
    assertConsecutiveDates(dto.sourceDate, dto.targetDate);
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - claimLeaseMs);
    const retryThreshold = new Date(now.getTime() - retryDelayMs);

    return this.prisma.$transaction(async transaction => {
      await releaseStaleClaims(transaction, dto.sourceDate, staleThreshold);
      const claims: v1.ClaimedTelegramDailyPlanRolloverDto[] = [];

      while (claims.length < dto.limit) {
        const claim = await claimNextRollover(
          transaction,
          dto.sourceDate,
          dto.targetDate,
          now,
          retryThreshold,
        );
        if (!claim) break;
        claims.push(toClaimedRolloverDto(claim));
      }

      return claims;
    });
  }

  async complete(
    dto: v1.CompleteTelegramDailyPlanRolloverDto,
  ): Promise<v1.TelegramReminderDeliveryResultDto> {
    const result = await this.prisma.dailyPlan.updateMany({
      where: {
        id: dto.sourcePlanId,
        rolloverToken: dto.deliveryToken,
        rolloverCompletedAt: null,
      },
      data: {
        rolloverCompletedAt: new Date(),
        rolloverToken: null,
        rolloverClaimedAt: null,
        rolloverLastError: null,
      },
    });

    assertActiveClaim(result.count);
    return { ok: true };
  }

  async fail(
    dto: v1.FailTelegramDailyPlanRolloverDto,
  ): Promise<v1.TelegramReminderDeliveryResultDto> {
    const result = await this.prisma.dailyPlan.updateMany({
      where: {
        id: dto.sourcePlanId,
        rolloverToken: dto.deliveryToken,
        rolloverCompletedAt: null,
      },
      data: {
        rolloverToken: null,
        rolloverLastError: dto.error,
      },
    });

    assertActiveClaim(result.count);
    return { ok: true };
  }
}

async function releaseStaleClaims(
  database: DatabaseClient,
  sourceDate: string,
  staleThreshold: Date,
): Promise<void> {
  await database.dailyPlan.updateMany({
    where: {
      planDate: planDate(sourceDate),
      rolloverCompletedAt: null,
      rolloverToken: { not: null },
      rolloverClaimedAt: { lte: staleThreshold },
    },
    data: {
      rolloverToken: null,
      rolloverLastError: 'Rollover claim expired before delivery was confirmed',
    },
  });
}

async function claimNextRollover(
  database: DatabaseClient,
  sourceDate: string,
  targetDate: string,
  now: Date,
  retryThreshold: Date,
): Promise<ClaimedRollover | null> {
  for (let contentionAttempt = 0; contentionAttempt < 5; contentionAttempt += 1) {
    const sourcePlan = await findRolloverCandidate(database, sourceDate, retryThreshold);
    if (!sourcePlan) return null;

    const deliveryToken = randomUUID();
    const claimed = await database.dailyPlan.updateMany({
      where: {
        id: sourcePlan.id,
        rolloverCompletedAt: null,
        rolloverToken: null,
      },
      data: {
        finalizedAt: now,
        rolloverToken: deliveryToken,
        rolloverClaimedAt: now,
        rolloverAttemptCount: { increment: 1 },
      },
    });

    if (claimed.count === 1) {
      const targetPlan = await createTargetPlan(database, sourcePlan, targetDate);
      await carryIncompleteItems(database, sourcePlan, targetPlan);

      return {
        sourcePlan: await findPlan(database, sourcePlan.id),
        targetPlan: await findPlan(database, targetPlan.id),
        deliveryToken,
      };
    }
  }

  return null;
}

function findRolloverCandidate(
  database: DatabaseClient,
  sourceDate: string,
  retryThreshold: Date,
): Promise<DailyPlanRecord | null> {
  return database.dailyPlan.findFirst({
    where: {
      planDate: planDate(sourceDate),
      rolloverCompletedAt: null,
      rolloverToken: null,
      OR: [{ rolloverClaimedAt: null }, { rolloverClaimedAt: { lte: retryThreshold } }],
      items: { some: {} },
    },
    orderBy: { createdAt: 'asc' },
    ...planWithItems,
  });
}

function createTargetPlan(
  database: DatabaseClient,
  sourcePlan: DailyPlanRecord,
  targetDate: string,
): Promise<DailyPlanRecord> {
  return database.dailyPlan.upsert({
    where: {
      userId_planDate: {
        userId: sourcePlan.userId,
        planDate: planDate(targetDate),
      },
    },
    create: {
      userId: sourcePlan.userId,
      planDate: planDate(targetDate),
    },
    update: {},
    ...planWithItems,
  });
}

async function carryIncompleteItems(
  database: DatabaseClient,
  sourcePlan: DailyPlanRecord,
  targetPlan: DailyPlanRecord,
): Promise<void> {
  const carriedSourceIds = new Set(
    targetPlan.items.flatMap(item => (item.carriedFromItemId ? [item.carriedFromItemId] : [])),
  );
  const itemsToCarry = sourcePlan.items.filter(
    item => !item.completed && !carriedSourceIds.has(item.id),
  );
  const maxPosition = targetPlan.items.reduce(
    (highest, item) => Math.max(highest, item.position),
    -1,
  );

  if (itemsToCarry.length === 0) return;

  await database.dailyPlanItem.createMany({
    data: itemsToCarry.map((item, index) => ({
      dailyPlanId: targetPlan.id,
      carriedFromItemId: item.id,
      text: item.text,
      description: item.description,
      completed: false,
      completedAt: null,
      carryCount: item.carryCount + 1,
      position: maxPosition + index + 1,
    })),
    skipDuplicates: true,
  });
}

function findPlan(database: DatabaseClient, id: string): Promise<DailyPlanRecord> {
  return database.dailyPlan.findUniqueOrThrow({
    where: { id },
    ...planWithItems,
  });
}

function toClaimedRolloverDto(claim: ClaimedRollover): v1.ClaimedTelegramDailyPlanRolloverDto {
  return {
    sourcePlan: toDailyPlanDto(claim.sourcePlan),
    targetPlan: toDailyPlanDto(claim.targetPlan),
    locale: claim.sourcePlan.user.locale.toLowerCase() as v1.TelegramLocale,
    deliveryToken: claim.deliveryToken,
  };
}

function toDailyPlanDto(plan: DailyPlanRecord): v1.TelegramDailyPlanDto {
  return {
    id: plan.id,
    telegramUserId: plan.user.telegramId.toString(),
    date: plan.planDate.toISOString().slice(0, 10),
    items: plan.items.map(item => ({
      id: item.id,
      text: item.text,
      description: item.description,
      completed: item.completed,
      completedAt: item.completedAt?.toISOString() ?? null,
      carryCount: item.carryCount,
      position: item.position,
    })),
  };
}

function assertConsecutiveDates(sourceDate: string, targetDate: string): void {
  const expectedTarget = new Date(`${sourceDate}T00:00:00.000Z`);
  expectedTarget.setUTCDate(expectedTarget.getUTCDate() + 1);

  if (expectedTarget.toISOString().slice(0, 10) !== targetDate) {
    throw new BadRequestException('Daily plan rollover dates must be consecutive');
  }
}

function assertActiveClaim(updatedCount: number): void {
  if (updatedCount === 0) {
    throw new NotFoundException('Active daily plan rollover claim not found');
  }
}

function planDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
