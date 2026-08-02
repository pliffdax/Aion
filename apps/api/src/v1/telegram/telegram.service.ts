import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { v1 } from '@aion/contracts';
import {
  Prisma,
  TelegramLocale,
  TelegramReminderRepeatType,
  TelegramReminderStatus,
} from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { nextReminderOccurrence } from './telegram-reminder-recurrence';

const maxDailyPlanItems = 20;
const maxActiveReminders = 100;
const reminderClaimLeaseMs = 5 * 60_000;
const maxReminderDeliveryAttempts = 3;
const planWithItems = {
  include: {
    user: true,
    items: {
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    },
  },
} satisfies Prisma.DailyPlanDefaultArgs;
const reminderWithUser = {
  include: {
    user: true,
  },
} satisfies Prisma.TelegramReminderDefaultArgs;

type DailyPlanRecord = Prisma.DailyPlanGetPayload<typeof planWithItems>;
type ReminderRecord = Prisma.TelegramReminderGetPayload<typeof reminderWithUser>;
type DatabaseClient = Pick<
  Prisma.TransactionClient,
  'telegramUser' | 'dailyPlan' | 'dailyPlanItem' | 'telegramReminder'
>;

@Injectable()
export class TelegramService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertUser(dto: v1.UpsertTelegramUserDto): Promise<v1.TelegramUserDto> {
    const user = await upsertTelegramUser(this.prisma, dto);
    return toTelegramUserDto(user);
  }

  async updateUserLocale(dto: v1.UpdateTelegramUserLocaleDto): Promise<v1.TelegramUserDto> {
    const telegramId = BigInt(dto.telegramUserId);
    const locale = toPrismaLocale(dto.locale);
    const user = await this.prisma.telegramUser.upsert({
      where: { telegramId },
      create: { telegramId, locale },
      update: { locale },
    });

    return toTelegramUserDto(user);
  }

  async updateUserReportProfile(
    dto: v1.UpdateTelegramReportProfileDto,
  ): Promise<v1.TelegramUserDto> {
    const telegramId = BigInt(dto.telegramUserId);
    const reportStartDate = dto.reportStartDate
      ? new Date(`${dto.reportStartDate}T00:00:00.000Z`)
      : undefined;
    const reportProfile = {
      ...(dto.reportAuthorName !== undefined ? { reportAuthorName: dto.reportAuthorName } : {}),
      ...(reportStartDate !== undefined ? { reportStartDate } : {}),
      ...(dto.reportDailySections !== undefined
        ? { reportDailySections: dto.reportDailySections }
        : {}),
      ...(dto.reportWeeklySections !== undefined
        ? { reportWeeklySections: dto.reportWeeklySections }
        : {}),
    };
    const user = await this.prisma.telegramUser.upsert({
      where: { telegramId },
      create: { telegramId, ...reportProfile },
      update: reportProfile,
    });

    return toTelegramUserDto(user);
  }

  async getOrCreateDailyPlan(
    dto: v1.GetOrCreateTelegramDailyPlanDto,
  ): Promise<v1.TelegramDailyPlanDto> {
    const plan = await upsertDailyPlan(this.prisma, dto);
    return toDailyPlanDto(plan);
  }

  async addDailyPlanItem(dto: v1.AddTelegramDailyPlanItemDto): Promise<v1.TelegramDailyPlanDto> {
    const plan = await this.prisma.$transaction(async transaction => {
      const dailyPlan = await upsertDailyPlan(transaction, dto);
      const aggregate = await transaction.dailyPlanItem.aggregate({
        where: { dailyPlanId: dailyPlan.id },
        _count: true,
        _max: { position: true },
      });

      if (aggregate._count >= maxDailyPlanItems) {
        throw new BadRequestException(`Daily plan supports at most ${maxDailyPlanItems} items`);
      }

      await transaction.dailyPlanItem.create({
        data: {
          dailyPlanId: dailyPlan.id,
          text: dto.text,
          position: (aggregate._max.position ?? -1) + 1,
        },
      });

      return findDailyPlan(transaction, dailyPlan.id);
    });

    return toDailyPlanDto(plan);
  }

  async updateDailyPlanItem(
    dto: v1.UpdateTelegramDailyPlanItemDto,
  ): Promise<v1.TelegramDailyPlanDto> {
    return this.updateOwnedDailyPlanItem(dto, () => ({
      ...(dto.text !== undefined ? { text: dto.text } : {}),
      ...(dto.completed !== undefined ? { completed: dto.completed } : {}),
    }));
  }

  async toggleDailyPlanItem(
    dto: v1.ToggleTelegramDailyPlanItemDto,
  ): Promise<v1.TelegramDailyPlanDto> {
    return this.updateOwnedDailyPlanItem(dto, item => ({
      completed: !item.completed,
    }));
  }

  private async updateOwnedDailyPlanItem(
    dto: v1.ToggleTelegramDailyPlanItemDto,
    getData: (item: { completed: boolean }) => {
      text?: string;
      completed?: boolean;
    },
  ): Promise<v1.TelegramDailyPlanDto> {
    const plan = await this.prisma.$transaction(async transaction => {
      const item = await findOwnedItem(transaction, dto);
      await transaction.dailyPlanItem.update({
        where: { id: item.id },
        data: getData(item),
      });
      return findDailyPlan(transaction, item.dailyPlanId);
    });

    return toDailyPlanDto(plan);
  }

  async deleteDailyPlanItem(
    dto: v1.DeleteTelegramDailyPlanItemDto,
  ): Promise<v1.TelegramDailyPlanDto> {
    const plan = await this.prisma.$transaction(async transaction => {
      const item = await findOwnedItem(transaction, dto);
      await transaction.dailyPlanItem.delete({ where: { id: item.id } });
      return findDailyPlan(transaction, item.dailyPlanId);
    });

    return toDailyPlanDto(plan);
  }

  async clearCompletedDailyPlanItems(
    dto: v1.ClearCompletedTelegramDailyPlanItemsDto,
  ): Promise<v1.TelegramDailyPlanDto> {
    const plan = await this.prisma.$transaction(async transaction => {
      const dailyPlan = await upsertDailyPlan(transaction, dto);
      await transaction.dailyPlanItem.deleteMany({
        where: {
          dailyPlanId: dailyPlan.id,
          completed: true,
        },
      });
      return findDailyPlan(transaction, dailyPlan.id);
    });

    return toDailyPlanDto(plan);
  }

  async createReminder(dto: v1.CreateTelegramReminderDto): Promise<v1.TelegramReminderDto> {
    const remindAt = parseFutureReminderDate(dto.remindAt);
    const reminder = await this.prisma.$transaction(async transaction => {
      const user = await upsertTelegramUser(transaction, {
        telegramUserId: dto.telegramUserId,
      });
      const activeCount = await transaction.telegramReminder.count({
        where: {
          userId: user.id,
          status: {
            in: [TelegramReminderStatus.PENDING, TelegramReminderStatus.PROCESSING],
          },
        },
      });

      if (activeCount >= maxActiveReminders) {
        throw new BadRequestException(
          `A user can have at most ${maxActiveReminders} active reminders`,
        );
      }

      return transaction.telegramReminder.create({
        data: {
          userId: user.id,
          chatId: BigInt(dto.chatId),
          text: dto.text,
          remindAt,
          availableAt: remindAt,
          timezone: dto.timezone,
          recurrenceAnchorAt: remindAt,
          ...toReminderRecurrenceData(dto.recurrence),
        },
        ...reminderWithUser,
      });
    });

    return toReminderDto(reminder);
  }

  async listReminders(dto: v1.ListTelegramRemindersDto): Promise<v1.TelegramReminderListDto> {
    const reminders = await this.prisma.telegramReminder.findMany({
      where: {
        user: {
          telegramId: BigInt(dto.telegramUserId),
        },
        status: {
          in: [TelegramReminderStatus.PENDING, TelegramReminderStatus.PROCESSING],
        },
      },
      orderBy: [{ remindAt: 'asc' }, { createdAt: 'asc' }],
      take: maxActiveReminders,
      ...reminderWithUser,
    });

    return reminders.map(toReminderDto);
  }

  async updateReminder(dto: v1.UpdateTelegramReminderDto): Promise<v1.TelegramReminderDto> {
    const current = await findOwnedReminder(this.prisma, dto.telegramUserId, dto.reminderId);

    if (current.status === TelegramReminderStatus.PROCESSING) {
      throw new BadRequestException('A reminder being delivered cannot be edited');
    }

    const remindAt = dto.remindAt ? parseFutureReminderDate(dto.remindAt) : current.remindAt;
    const scheduleChanged =
      dto.remindAt !== undefined || dto.timezone !== undefined || dto.recurrence !== undefined;
    const reminder = await this.prisma.telegramReminder.update({
      where: { id: current.id },
      data: {
        ...(dto.text !== undefined ? { text: dto.text } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(scheduleChanged
          ? {
              remindAt,
              availableAt: remindAt,
              recurrenceAnchorAt: remindAt,
              sentCount: 0,
            }
          : {}),
        ...(dto.recurrence !== undefined ? toReminderRecurrenceData(dto.recurrence) : {}),
        status: TelegramReminderStatus.PENDING,
        deliveryToken: null,
        claimedAt: null,
        attemptCount: 0,
        lastError: null,
      },
      ...reminderWithUser,
    });

    return toReminderDto(reminder);
  }

  async cancelReminder(dto: v1.DeleteTelegramReminderDto): Promise<v1.TelegramReminderDto> {
    const current = await findOwnedReminder(this.prisma, dto.telegramUserId, dto.reminderId);
    const reminder = await this.prisma.telegramReminder.update({
      where: { id: current.id },
      data: {
        status: TelegramReminderStatus.CANCELLED,
        deliveryToken: null,
        claimedAt: null,
      },
      ...reminderWithUser,
    });

    return toReminderDto(reminder);
  }

  async claimDueReminders(
    dto: v1.ClaimTelegramRemindersDto,
  ): Promise<v1.ClaimedTelegramReminderListDto> {
    const now = new Date();
    const staleClaimThreshold = new Date(now.getTime() - reminderClaimLeaseMs);

    return this.prisma.$transaction(async transaction => {
      await transaction.telegramReminder.updateMany({
        where: {
          status: TelegramReminderStatus.PROCESSING,
          claimedAt: { lte: staleClaimThreshold },
        },
        data: {
          status: TelegramReminderStatus.PENDING,
          deliveryToken: null,
          claimedAt: null,
          availableAt: now,
        },
      });

      const claimed: v1.ClaimedTelegramReminderDto[] = [];

      while (claimed.length < dto.limit) {
        const reminder = await claimNextReminder(transaction, now);
        if (!reminder) break;
        claimed.push(toClaimedReminderDto(reminder));
      }

      return claimed;
    });
  }

  async completeReminderDelivery(
    dto: v1.CompleteTelegramReminderDeliveryDto,
  ): Promise<v1.TelegramReminderDeliveryResultDto> {
    await this.prisma.$transaction(async transaction => {
      const reminder = await transaction.telegramReminder.findFirst({
        where: {
          id: dto.reminderId,
          deliveryToken: dto.deliveryToken,
          status: TelegramReminderStatus.PROCESSING,
        },
      });

      if (!reminder) {
        throw new NotFoundException('Active reminder delivery claim not found');
      }

      const now = new Date();
      const sentCount = reminder.sentCount + 1;
      const repeatLimitReached = reminder.repeatLimit !== null && sentCount >= reminder.repeatLimit;
      const nextOccurrence = repeatLimitReached ? null : nextReminderOccurrence(reminder, now);
      const result = await transaction.telegramReminder.updateMany({
        where: {
          id: reminder.id,
          deliveryToken: dto.deliveryToken,
          status: TelegramReminderStatus.PROCESSING,
        },
        data: {
          status: nextOccurrence ? TelegramReminderStatus.PENDING : TelegramReminderStatus.SENT,
          ...(nextOccurrence
            ? {
                remindAt: nextOccurrence,
                availableAt: nextOccurrence,
              }
            : {}),
          sentCount,
          sentAt: now,
          deliveryToken: null,
          claimedAt: null,
          attemptCount: 0,
          lastError: null,
        },
      });

      assertDeliveryClaim(result.count);
    });

    return { ok: true };
  }

  async failReminderDelivery(
    dto: v1.FailTelegramReminderDeliveryDto,
  ): Promise<v1.TelegramReminderDeliveryResultDto> {
    const reminder = await this.prisma.telegramReminder.findFirst({
      where: {
        id: dto.reminderId,
        deliveryToken: dto.deliveryToken,
        status: TelegramReminderStatus.PROCESSING,
      },
    });

    if (!reminder) {
      throw new NotFoundException('Active reminder delivery claim not found');
    }

    const exhausted = reminder.attemptCount >= maxReminderDeliveryAttempts;
    await this.prisma.telegramReminder.update({
      where: { id: reminder.id },
      data: {
        status: exhausted ? TelegramReminderStatus.FAILED : TelegramReminderStatus.PENDING,
        availableAt: new Date(Date.now() + reminder.attemptCount * 60_000),
        deliveryToken: null,
        claimedAt: null,
        lastError: dto.error,
      },
    });

    return { ok: true };
  }
}

async function upsertTelegramUser(database: DatabaseClient, dto: v1.UpsertTelegramUserDto) {
  const telegramId = BigInt(dto.telegramUserId);

  return database.telegramUser.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username: dto.username ?? null,
      firstName: dto.firstName ?? null,
    },
    update: {
      ...(dto.username !== undefined ? { username: dto.username } : {}),
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
    },
  });
}

async function findOwnedReminder(
  database: DatabaseClient,
  telegramUserId: string,
  reminderId: string,
) {
  const reminder = await database.telegramReminder.findFirst({
    where: {
      id: reminderId,
      user: {
        telegramId: BigInt(telegramUserId),
      },
      status: {
        in: [
          TelegramReminderStatus.PENDING,
          TelegramReminderStatus.PROCESSING,
          TelegramReminderStatus.FAILED,
        ],
      },
    },
  });

  if (!reminder) {
    throw new NotFoundException('Active reminder not found for this user');
  }

  return reminder;
}

async function claimNextReminder(
  database: DatabaseClient,
  now: Date,
): Promise<ReminderRecord | null> {
  for (let contentionAttempt = 0; contentionAttempt < 5; contentionAttempt += 1) {
    const candidate = await database.telegramReminder.findFirst({
      where: {
        status: TelegramReminderStatus.PENDING,
        availableAt: { lte: now },
      },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    });

    if (!candidate) return null;

    const deliveryToken = randomUUID();
    const claimed = await database.telegramReminder.updateMany({
      where: {
        id: candidate.id,
        status: TelegramReminderStatus.PENDING,
        availableAt: { lte: now },
      },
      data: {
        status: TelegramReminderStatus.PROCESSING,
        deliveryToken,
        claimedAt: now,
        attemptCount: { increment: 1 },
      },
    });

    if (claimed.count === 1) {
      return database.telegramReminder.findUniqueOrThrow({
        where: { id: candidate.id },
        ...reminderWithUser,
      });
    }
  }

  return null;
}

function parseFutureReminderDate(value: string): Date {
  const date = new Date(value);

  if (date.getTime() <= Date.now()) {
    throw new BadRequestException('Reminder date must be in the future');
  }

  return date;
}

function assertDeliveryClaim(updatedCount: number): void {
  if (updatedCount === 0) {
    throw new NotFoundException('Active reminder delivery claim not found');
  }
}

async function upsertDailyPlan(
  database: DatabaseClient,
  dto: v1.GetOrCreateTelegramDailyPlanDto,
): Promise<DailyPlanRecord> {
  const user = await upsertTelegramUser(database, {
    telegramUserId: dto.telegramUserId,
  });
  const planDate = new Date(`${dto.date}T00:00:00.000Z`);

  return database.dailyPlan.upsert({
    where: {
      userId_planDate: {
        userId: user.id,
        planDate,
      },
    },
    create: {
      userId: user.id,
      planDate,
    },
    update: {},
    ...planWithItems,
  });
}

function findDailyPlan(database: DatabaseClient, planId: string): Promise<DailyPlanRecord> {
  return database.dailyPlan.findUniqueOrThrow({
    where: { id: planId },
    ...planWithItems,
  });
}

async function findOwnedItem(database: DatabaseClient, dto: v1.ToggleTelegramDailyPlanItemDto) {
  const item = await database.dailyPlanItem.findFirst({
    where: {
      id: dto.itemId,
      dailyPlan: {
        planDate: new Date(`${dto.date}T00:00:00.000Z`),
        user: {
          telegramId: BigInt(dto.telegramUserId),
        },
      },
    },
  });

  if (!item) {
    throw new NotFoundException('Daily plan item not found for this user and date');
  }

  return item;
}

function toTelegramUserDto(user: {
  id: string;
  telegramId: bigint;
  username: string | null;
  firstName: string | null;
  locale: TelegramLocale;
  reportAuthorName: string | null;
  reportStartDate: Date | null;
  reportDailySections: string[];
  reportWeeklySections: string[];
}): v1.TelegramUserDto {
  return {
    id: user.id,
    telegramUserId: user.telegramId.toString(),
    username: user.username,
    firstName: user.firstName,
    locale: user.locale.toLowerCase() as v1.TelegramLocale,
    reportAuthorName: user.reportAuthorName,
    reportStartDate: user.reportStartDate?.toISOString().slice(0, 10) ?? null,
    reportDailySections: v1.TelegramDailyReportSectionsSchema.parse(user.reportDailySections),
    reportWeeklySections: v1.TelegramWeeklyReportSectionsSchema.parse(user.reportWeeklySections),
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
      completed: item.completed,
      position: item.position,
    })),
  };
}

function toReminderDto(reminder: ReminderRecord): v1.TelegramReminderDto {
  return {
    id: reminder.id,
    telegramUserId: reminder.user.telegramId.toString(),
    chatId: reminder.chatId.toString(),
    text: reminder.text,
    remindAt: reminder.remindAt.toISOString(),
    timezone: reminder.timezone,
    status: reminder.status.toLowerCase() as v1.TelegramReminderStatus,
    recurrence: toReminderRecurrenceDto(reminder),
    sentCount: reminder.sentCount,
  };
}

function toClaimedReminderDto(reminder: ReminderRecord): v1.ClaimedTelegramReminderDto {
  if (!reminder.deliveryToken) {
    throw new Error(`Claimed reminder ${reminder.id} has no delivery token`);
  }

  return {
    ...toReminderDto(reminder),
    locale: reminder.user.locale.toLowerCase() as v1.TelegramLocale,
    deliveryToken: reminder.deliveryToken,
  };
}

function toPrismaLocale(locale: v1.TelegramLocale): TelegramLocale {
  switch (locale) {
    case 'uk':
      return TelegramLocale.UK;
    case 'en':
      return TelegramLocale.EN;
    default:
      return TelegramLocale.RU;
  }
}

function toReminderRecurrenceData(
  recurrence: v1.TelegramReminderRecurrence,
): Pick<
  Prisma.TelegramReminderUncheckedCreateInput,
  'repeatType' | 'repeatIntervalMinutes' | 'repeatLimit'
> {
  switch (recurrence.type) {
    case 'none':
      return {
        repeatType: TelegramReminderRepeatType.NONE,
        repeatIntervalMinutes: null,
        repeatLimit: null,
      };
    case 'interval':
      return {
        repeatType: TelegramReminderRepeatType.INTERVAL,
        repeatIntervalMinutes: recurrence.intervalMinutes,
        repeatLimit: recurrence.repeatLimit,
      };
    case 'daily':
    case 'weekly':
    case 'monthly':
    case 'yearly':
      return {
        repeatType: toPrismaRepeatType(recurrence.type),
        repeatIntervalMinutes: null,
        repeatLimit: recurrence.repeatLimit,
      };
  }
}

function toReminderRecurrenceDto(reminder: ReminderRecord): v1.TelegramReminderRecurrence {
  switch (reminder.repeatType) {
    case TelegramReminderRepeatType.NONE:
      return { type: 'none' };
    case TelegramReminderRepeatType.INTERVAL:
      if (reminder.repeatIntervalMinutes === null || reminder.repeatLimit === null) {
        throw new Error(`Interval reminder ${reminder.id} has an invalid recurrence config`);
      }
      return {
        type: 'interval',
        intervalMinutes: reminder.repeatIntervalMinutes,
        repeatLimit: reminder.repeatLimit,
      };
    case TelegramReminderRepeatType.DAILY:
    case TelegramReminderRepeatType.WEEKLY:
    case TelegramReminderRepeatType.MONTHLY:
    case TelegramReminderRepeatType.YEARLY:
      return {
        type: reminder.repeatType.toLowerCase() as 'daily' | 'weekly' | 'monthly' | 'yearly',
        repeatLimit: reminder.repeatLimit,
      };
  }
}

function toPrismaRepeatType(
  type: Exclude<v1.TelegramReminderRepeatType, 'none' | 'interval'>,
): TelegramReminderRepeatType {
  const values = {
    daily: TelegramReminderRepeatType.DAILY,
    weekly: TelegramReminderRepeatType.WEEKLY,
    monthly: TelegramReminderRepeatType.MONTHLY,
    yearly: TelegramReminderRepeatType.YEARLY,
  } satisfies Record<typeof type, TelegramReminderRepeatType>;

  return values[type];
}
