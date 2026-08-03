import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v1 } from '@aion/contracts';
import {
  Prisma,
  TelegramLocale,
  TelegramReportDeliveryStatus,
  TelegramReportType,
  TelegramReminderRepeatType,
  TelegramReminderStatus,
} from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { nextReminderOccurrence } from './telegram-reminder-recurrence';

const maxDailyPlanItems = 20;
const maxActiveReminders = 100;
const reminderClaimLeaseMs = 5 * 60_000;
const maxReminderDeliveryAttempts = 3;
const reportClaimLeaseMs = 5 * 60_000;
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
  'telegramUser' | 'dailyPlan' | 'dailyPlanItem' | 'telegramReminder' | 'telegramReport'
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
      create: {
        telegramId,
        locale,
        reportDailySections: defaultDailyReportFields(),
        reportWeeklySections: defaultWeeklyReportFields(),
      },
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
        ? { reportDailySections: dto.reportDailySections as Prisma.InputJsonValue }
        : {}),
      ...(dto.reportWeeklySections !== undefined
        ? { reportWeeklySections: dto.reportWeeklySections as Prisma.InputJsonValue }
        : {}),
    };
    const user = await this.prisma.telegramUser.upsert({
      where: { telegramId },
      create: {
        telegramId,
        reportDailySections:
          (reportProfile.reportDailySections as Prisma.InputJsonValue | undefined) ??
          defaultDailyReportFields(),
        reportWeeklySections:
          (reportProfile.reportWeeklySections as Prisma.InputJsonValue | undefined) ??
          defaultWeeklyReportFields(),
        ...(reportProfile.reportAuthorName !== undefined
          ? { reportAuthorName: reportProfile.reportAuthorName }
          : {}),
        ...(reportProfile.reportStartDate !== undefined
          ? { reportStartDate: reportProfile.reportStartDate }
          : {}),
      },
      update: reportProfile,
    });

    return toTelegramUserDto(user);
  }

  async claimReportDelivery(
    dto: v1.ClaimTelegramReportDeliveryDto,
  ): Promise<v1.ClaimedTelegramReportDeliveryDto> {
    const periodStart = parseReportDate(dto.periodStart);
    const periodEnd = parseReportDate(dto.periodEnd);
    const type = toPrismaReportType(dto.type);
    const now = new Date();
    const staleClaimThreshold = new Date(now.getTime() - reportClaimLeaseMs);

    return this.prisma.$transaction(async transaction => {
      const user = await upsertTelegramUser(transaction, {
        telegramUserId: dto.telegramUserId,
      });
      const report = await transaction.telegramReport.upsert({
        where: {
          userId_type_periodStart_periodEnd: {
            userId: user.id,
            type,
            periodStart,
            periodEnd,
          },
        },
        create: {
          userId: user.id,
          type,
          periodStart,
          periodEnd,
          text: dto.text,
        },
        update: {},
      });

      if (report.text !== dto.text) {
        throw new ConflictException('A different report snapshot already exists for this period');
      }

      if (report.deliveryStatus === TelegramReportDeliveryStatus.SENT) {
        return { reportId: report.id, outcome: 'already_sent', deliveryToken: null };
      }

      const deliveryToken = randomUUID();
      const claim = await transaction.telegramReport.updateMany({
        where: {
          id: report.id,
          deliveryStatus: { not: TelegramReportDeliveryStatus.SENT },
          OR: [
            { deliveryStatus: { not: TelegramReportDeliveryStatus.PROCESSING } },
            { claimedAt: { lte: staleClaimThreshold } },
            { claimedAt: null },
          ],
        },
        data: {
          deliveryStatus: TelegramReportDeliveryStatus.PROCESSING,
          deliveryToken,
          claimedAt: now,
          lastError: null,
        },
      });

      return {
        reportId: report.id,
        outcome: claim.count === 1 ? 'claimed' : 'busy',
        deliveryToken: claim.count === 1 ? deliveryToken : null,
      } as v1.ClaimedTelegramReportDeliveryDto;
    });
  }

  async completeReportDelivery(
    dto: v1.CompleteTelegramReportDeliveryDto,
  ): Promise<v1.TelegramReportDeliveryResultDto> {
    const result = await this.prisma.telegramReport.updateMany({
      where: {
        id: dto.reportId,
        deliveryToken: dto.deliveryToken,
        deliveryStatus: TelegramReportDeliveryStatus.PROCESSING,
      },
      data: {
        deliveryStatus: TelegramReportDeliveryStatus.SENT,
        sentAt: new Date(),
        telegramMessageId: BigInt(dto.telegramMessageId),
        deliveryToken: null,
        claimedAt: null,
        lastError: null,
      },
    });

    if (result.count !== 1) throw new NotFoundException('Active report delivery claim not found');
    return { ok: true };
  }

  async failReportDelivery(
    dto: v1.FailTelegramReportDeliveryDto,
  ): Promise<v1.TelegramReportDeliveryResultDto> {
    const result = await this.prisma.telegramReport.updateMany({
      where: {
        id: dto.reportId,
        deliveryToken: dto.deliveryToken,
        deliveryStatus: TelegramReportDeliveryStatus.PROCESSING,
      },
      data: {
        deliveryStatus: TelegramReportDeliveryStatus.FAILED,
        deliveryToken: null,
        claimedAt: null,
        lastError: dto.error,
      },
    });

    if (result.count !== 1) throw new NotFoundException('Active report delivery claim not found');
    return { ok: true };
  }

  async listReportHistory(
    dto: v1.ListTelegramReportHistoryDto,
  ): Promise<v1.TelegramReportHistoryPageDto> {
    const reports = await this.prisma.telegramReport.findMany({
      where: {
        user: { telegramId: BigInt(dto.telegramUserId) },
        deliveryStatus: TelegramReportDeliveryStatus.SENT,
        ...(dto.type ? { type: toPrismaReportType(dto.type) } : {}),
        ...(dto.periodFrom || dto.periodTo
          ? {
              periodStart: dto.periodTo ? { lte: parseReportDate(dto.periodTo) } : undefined,
              periodEnd: dto.periodFrom ? { gte: parseReportDate(dto.periodFrom) } : undefined,
            }
          : {}),
      },
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      take: dto.limit + 1,
      include: { user: true },
    });
    const hasNextPage = reports.length > dto.limit;
    const items = hasNextPage ? reports.slice(0, dto.limit) : reports;

    return {
      items: items.map(toReportDto),
      nextCursor: hasNextPage ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async getReportHistoryItem(
    dto: v1.GetTelegramReportHistoryItemDto,
  ): Promise<v1.TelegramReportDto> {
    const report = await this.prisma.telegramReport.findFirst({
      where: {
        id: dto.reportId,
        user: { telegramId: BigInt(dto.telegramUserId) },
        deliveryStatus: TelegramReportDeliveryStatus.SENT,
      },
      include: { user: true },
    });

    if (!report) throw new NotFoundException('Sent report not found');
    return toReportDto(report);
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
          ...(dto.description !== undefined ? { description: dto.description } : {}),
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
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.completed !== undefined
        ? {
            completed: dto.completed,
            completedAt: dto.completed ? new Date() : null,
          }
        : {}),
    }));
  }

  async toggleDailyPlanItem(
    dto: v1.ToggleTelegramDailyPlanItemDto,
  ): Promise<v1.TelegramDailyPlanDto> {
    return this.updateOwnedDailyPlanItem(dto, item => {
      const completed = !item.completed;
      return {
        completed,
        completedAt: completed ? new Date() : null,
      };
    });
  }

  private async updateOwnedDailyPlanItem(
    dto: v1.ToggleTelegramDailyPlanItemDto,
    getData: (item: { completed: boolean }) => {
      text?: string;
      description?: string | null;
      completed?: boolean;
      completedAt?: Date | null;
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
    // Kept as a no-op for older bot clients. Completed items are historical data;
    // current clients hide them locally instead of deleting them from the database.
    const dailyPlan = await upsertDailyPlan(this.prisma, dto);
    const plan = await findDailyPlan(this.prisma, dailyPlan.id);

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
      reportDailySections: defaultDailyReportFields(),
      reportWeeklySections: defaultWeeklyReportFields(),
    },
    update: {
      ...(dto.username !== undefined ? { username: dto.username } : {}),
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
    },
  });
}

function defaultDailyReportFields(): Prisma.InputJsonValue {
  return v1.DefaultTelegramDailyReportSections as Prisma.InputJsonValue;
}

function defaultWeeklyReportFields(): Prisma.InputJsonValue {
  return v1.DefaultTelegramWeeklyReportSections as Prisma.InputJsonValue;
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
  reportDailySections: Prisma.JsonValue;
  reportWeeklySections: Prisma.JsonValue;
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
      description: item.description,
      completed: item.completed,
      completedAt: item.completedAt?.toISOString() ?? null,
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

function parseReportDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toPrismaReportType(type: v1.TelegramReportType): TelegramReportType {
  return type === 'daily' ? TelegramReportType.DAILY : TelegramReportType.WEEKLY;
}

function toReportDto(report: {
  id: string;
  type: TelegramReportType;
  periodStart: Date;
  periodEnd: Date;
  text: string;
  createdAt: Date;
  sentAt: Date | null;
  user: { telegramId: bigint };
}): v1.TelegramReportDto {
  if (!report.sentAt) throw new Error(`Sent report ${report.id} has no sentAt timestamp`);

  return {
    id: report.id,
    telegramUserId: report.user.telegramId.toString(),
    type: report.type.toLowerCase() as v1.TelegramReportType,
    periodStart: report.periodStart.toISOString().slice(0, 10),
    periodEnd: report.periodEnd.toISOString().slice(0, 10),
    text: report.text,
    createdAt: report.createdAt.toISOString(),
    sentAt: report.sentAt.toISOString(),
  };
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
