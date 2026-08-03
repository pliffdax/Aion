import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { TelegramReportDeliveryStatus, TelegramReportType } from '@/generated/prisma/client';
import { TelegramService } from './telegram.service';

test('persists one snapshot and makes delivery retries idempotent', async () => {
  const database = createReportDatabase();
  const service = new TelegramService(database.client as never);
  const input = {
    telegramUserId: '123',
    type: 'daily' as const,
    periodStart: '2026-08-03',
    periodEnd: '2026-08-03',
    text: '<b>03.08.2026</b>\nReport',
  };

  const first = await service.claimReportDelivery(input);
  assert.equal(first.outcome, 'claimed');
  assert.equal(database.reports.length, 1);
  assert.deepEqual(
    await service.listReportHistory({ telegramUserId: '123', limit: 10 }),
    { items: [], nextCursor: null },
  );

  const concurrent = await service.claimReportDelivery(input);
  assert.deepEqual(concurrent, {
    reportId: first.reportId,
    outcome: 'busy',
    deliveryToken: null,
  });

  assert.equal(first.outcome, 'claimed');
  await service.completeReportDelivery({
    reportId: first.reportId,
    deliveryToken: first.deliveryToken,
    telegramMessageId: '77',
  });

  const retry = await service.claimReportDelivery(input);
  assert.deepEqual(retry, {
    reportId: first.reportId,
    outcome: 'already_sent',
    deliveryToken: null,
  });
  assert.equal(database.reports.length, 1);

  const history = await service.listReportHistory({ telegramUserId: '123', limit: 10 });
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0]?.text, input.text);
});

test('failed delivery can be claimed again without replacing its snapshot', async () => {
  const database = createReportDatabase();
  const service = new TelegramService(database.client as never);
  const input = {
    telegramUserId: '123',
    type: 'weekly' as const,
    periodStart: '2026-08-02',
    periodEnd: '2026-08-08',
    text: '<b>Неделя 3</b>',
  };

  const first = await service.claimReportDelivery(input);
  assert.equal(first.outcome, 'claimed');
  await service.failReportDelivery({
    reportId: first.reportId,
    deliveryToken: first.deliveryToken,
    error: 'Telegram unavailable',
  });

  const retry = await service.claimReportDelivery(input);
  assert.equal(retry.outcome, 'claimed');
  assert.notEqual(retry.deliveryToken, first.deliveryToken);
  assert.equal(database.reports.length, 1);
});

test('rejects a different immutable snapshot for an existing report period', async () => {
  const database = createReportDatabase();
  const service = new TelegramService(database.client as never);
  const input = {
    telegramUserId: '123',
    type: 'daily' as const,
    periodStart: '2026-08-03',
    periodEnd: '2026-08-03',
    text: 'Original',
  };

  await service.claimReportDelivery(input);

  await assert.rejects(
    service.claimReportDelivery({ ...input, text: 'Changed' }),
    ConflictException,
  );
  assert.equal(database.reports[0]?.text, 'Original');
});

function createReportDatabase() {
  const user = {
    id: 'user-1',
    telegramId: 123n,
    username: null,
    firstName: null,
    locale: 'RU',
    reportAuthorName: null,
    reportStartDate: null,
    reportDailySections: [],
    reportWeeklySections: [],
  };
  const reports: ReportRow[] = [];
  const telegramReport = {
    upsert: async (query: {
      create: Pick<ReportRow, 'userId' | 'type' | 'periodStart' | 'periodEnd' | 'text'>;
    }) => {
      const existing = reports.find(
        report =>
          report.userId === query.create.userId &&
          report.type === query.create.type &&
          report.periodStart.getTime() === query.create.periodStart.getTime() &&
          report.periodEnd.getTime() === query.create.periodEnd.getTime(),
      );
      if (existing) return existing;

      const report: ReportRow = {
        id: `report-${reports.length + 1}`,
        ...query.create,
        deliveryStatus: TelegramReportDeliveryStatus.PENDING,
        deliveryToken: null,
        claimedAt: null,
        sentAt: null,
        telegramMessageId: null,
        lastError: null,
        createdAt: new Date('2026-08-03T12:00:00.000Z'),
      };
      reports.push(report);
      return report;
    },
    updateMany: async (query: {
      where: { id: string; deliveryToken?: string; deliveryStatus?: unknown; OR?: unknown };
      data: Partial<ReportRow>;
    }) => {
      const report = reports.find(candidate => candidate.id === query.where.id);
      if (!report || !canApplyUpdate(report, query)) return { count: 0 };
      Object.assign(report, query.data);
      return { count: 1 };
    },
    findMany: async () =>
      reports
        .filter(report => report.deliveryStatus === TelegramReportDeliveryStatus.SENT)
        .map(report => ({ ...report, user })),
    findFirst: async () => null,
  };
  const client = {
    telegramUser: { upsert: async () => user },
    telegramReport,
    $transaction: async <T>(run: (transaction: unknown) => Promise<T>) => run(client),
  };

  return { client, reports };
}

function canApplyUpdate(
  report: ReportRow,
  query: {
    where: { deliveryToken?: string };
    data: Partial<ReportRow>;
  },
): boolean {
  if (query.data.deliveryStatus === TelegramReportDeliveryStatus.PROCESSING) {
    return report.deliveryStatus !== TelegramReportDeliveryStatus.PROCESSING;
  }

  return (
    report.deliveryStatus === TelegramReportDeliveryStatus.PROCESSING &&
    report.deliveryToken === query.where.deliveryToken
  );
}

interface ReportRow {
  id: string;
  userId: string;
  type: TelegramReportType;
  periodStart: Date;
  periodEnd: Date;
  text: string;
  deliveryStatus: TelegramReportDeliveryStatus;
  deliveryToken: string | null;
  claimedAt: Date | null;
  sentAt: Date | null;
  telegramMessageId: bigint | null;
  lastError: string | null;
  createdAt: Date;
}
