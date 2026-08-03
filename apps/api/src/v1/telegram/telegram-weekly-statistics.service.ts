import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { v1 } from '@aion/contracts';
import { TelegramReportDeliveryStatus, TelegramReportType } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class TelegramWeeklyStatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    dto: v1.GetTelegramWeeklyPlanStatisticsDto,
  ): Promise<v1.TelegramWeeklyPlanStatisticsDto> {
    const period = weeklyPeriod(dto.periodStart);
    const user = await this.prisma.telegramUser.findUnique({
      where: { telegramId: BigInt(dto.telegramUserId) },
      select: { id: true, telegramId: true, locale: true },
    });

    if (!user) throw new NotFoundException('Telegram user not found');
    return this.statisticsForUser(user, period);
  }

  async listCandidates(
    dto: v1.ListTelegramWeeklyPlanStatisticsCandidatesDto,
  ): Promise<v1.TelegramWeeklyPlanStatisticsCandidatePageDto> {
    const period = weeklyPeriod(dto.periodStart);
    const users = await this.prisma.telegramUser.findMany({
      where: {
        AND: [
          {
            dailyPlans: {
              some: {
                planDate: { gte: period.start, lte: period.end },
                items: { some: {} },
              },
            },
          },
          {
            dailyPlans: {
              none: {
                planDate: period.end,
                rolloverCompletedAt: null,
                items: { some: {} },
              },
            },
          },
        ],
        reports: {
          none: {
            type: TelegramReportType.WEEKLY_STATISTICS,
            periodStart: period.start,
            periodEnd: period.end,
            deliveryStatus: TelegramReportDeliveryStatus.SENT,
          },
        },
      },
      orderBy: { id: 'asc' },
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      take: dto.limit + 1,
      select: { id: true, telegramId: true, locale: true },
    });
    const hasNextPage = users.length > dto.limit;
    const pageUsers = hasNextPage ? users.slice(0, dto.limit) : users;

    return {
      items: await Promise.all(pageUsers.map(user => this.statisticsForUser(user, period))),
      nextCursor: hasNextPage ? (pageUsers.at(-1)?.id ?? null) : null,
    };
  }

  private async statisticsForUser(
    user: { id: string; telegramId: bigint; locale: string },
    period: WeeklyPeriod,
  ): Promise<v1.TelegramWeeklyPlanStatisticsDto> {
    const [plans, carryTargets] = await Promise.all([
      this.prisma.dailyPlan.findMany({
        where: {
          userId: user.id,
          planDate: { gte: period.start, lte: period.end },
        },
        include: {
          items: {
            include: {
              carriedFromItem: {
                select: {
                  dailyPlan: { select: { planDate: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.dailyPlanItem.findMany({
        where: {
          carriedFromItem: {
            dailyPlan: {
              userId: user.id,
              planDate: { gte: period.start, lte: period.end },
            },
          },
        },
        include: {
          dailyPlan: { select: { planDate: true } },
        },
      }),
    ]);
    const items = plans.flatMap(plan => plan.items);
    const internalCarryCount = items.filter(item => {
      const sourceDate = item.carriedFromItem?.dailyPlan.planDate;
      return sourceDate && sourceDate >= period.start && sourceDate <= period.end;
    }).length;
    const taskCount = Math.max(0, items.length - internalCarryCount);
    const completedItems = items.filter(item => item.completed);
    const outgoingItems = carryTargets.filter(item => item.dailyPlan.planDate > period.end);
    const terminalItems = [
      ...completedItems,
      ...outgoingItems.map(item => ({ ...item, completed: false })),
    ]
      .filter(item => item.carryCount > 0)
      .sort(
        (left, right) => right.carryCount - left.carryCount || left.text.localeCompare(right.text),
      )
      .slice(0, 5);

    return {
      telegramUserId: user.telegramId.toString(),
      locale: user.locale.toLowerCase() as v1.TelegramLocale,
      periodStart: period.startKey,
      periodEnd: period.endKey,
      taskCount,
      completedCount: completedItems.length,
      unfinishedCount: outgoingItems.length,
      carryEventCount: carryTargets.length,
      completionRate:
        taskCount === 0 ? 0 : Math.min(100, Math.round((completedItems.length / taskCount) * 100)),
      mostCarriedItems: terminalItems.map(item => ({
        text: item.text,
        carryCount: item.carryCount,
        completed: item.completed,
      })),
    };
  }
}

interface WeeklyPeriod {
  start: Date;
  end: Date;
  startKey: string;
  endKey: string;
}

function weeklyPeriod(periodStart: string): WeeklyPeriod {
  const start = new Date(`${periodStart}T00:00:00.000Z`);

  if (start.getUTCDay() !== 1) {
    throw new BadRequestException('Weekly statistics period must start on Monday');
  }

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    start,
    end,
    startKey: periodStart,
    endKey: end.toISOString().slice(0, 10),
  };
}
