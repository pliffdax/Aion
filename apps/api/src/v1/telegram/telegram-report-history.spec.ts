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
  assert.deepEqual(await service.listReportHistory({ telegramUserId: '123', limit: 10 }), {
    items: [],
    nextCursor: null,
  });

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

test('replaces a sent report and preserves its previous revision', async () => {
  const database = createReportDatabase();
  const service = new TelegramService(database.client as never);
  const configuration = [field('summary', 'Итог', 'text')];
  const originalAnswers = {
    summary: { text: 'Первый вариант', items: [], rating: null, boolean: null },
  };
  const input = {
    telegramUserId: '123',
    type: 'daily' as const,
    periodStart: '2026-08-03',
    periodEnd: '2026-08-03',
    text: 'Original',
    answers: originalAnswers,
    configuration,
  };

  const claim = await service.claimReportDelivery(input);
  assert.equal(claim.outcome, 'claimed');
  await service.completeReportDelivery({
    reportId: claim.reportId,
    deliveryToken: claim.deliveryToken,
    telegramMessageId: '77',
  });

  const existing = await service.findEditableReport({
    telegramUserId: '123',
    type: 'daily',
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
  assert.equal(existing?.revision, 1);
  assert.deepEqual(existing?.answers, originalAnswers);

  const changedAnswers = {
    summary: { text: 'Новый вариант', items: [], rating: null, boolean: null },
  };
  const replaced = await service.replaceReport({
    telegramUserId: '123',
    reportId: claim.reportId,
    expectedRevision: 1,
    text: 'Changed',
    answers: changedAnswers,
    configuration,
    telegramMessageId: '78',
  });

  assert.equal(replaced.revision, 2);
  assert.equal(replaced.text, 'Changed');
  assert.deepEqual(replaced.answers, changedAnswers);
  assert.equal(replaced.telegramMessageId, '78');
  assert.equal(database.revisions.length, 1);
  assert.equal(database.revisions[0]?.revision, 1);
  assert.equal(database.revisions[0]?.text, 'Original');
  assert.deepEqual(database.revisions[0]?.answers, originalAnswers);
  assert.equal(
    (await service.listReportHistory({ telegramUserId: '123', limit: 10 })).items[0]?.text,
    'Changed',
  );

  await assert.rejects(
    service.replaceReport({
      telegramUserId: '123',
      reportId: claim.reportId,
      expectedRevision: 1,
      text: 'Stale change',
      answers: changedAnswers,
      configuration,
      telegramMessageId: '79',
    }),
    ConflictException,
  );
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
  const revisions: ReportRevisionRow[] = [];
  const telegramReport = {
    upsert: async (query: {
      create: Pick<ReportRow, 'userId' | 'type' | 'periodStart' | 'periodEnd' | 'text'> &
        Partial<Pick<ReportRow, 'answers' | 'configuration'>>;
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
        answers: query.create.answers ?? null,
        configuration: query.create.configuration ?? null,
        revision: 1,
        createdAt: new Date('2026-08-03T12:00:00.000Z'),
        updatedAt: new Date('2026-08-03T12:00:00.000Z'),
      };
      reports.push(report);
      return report;
    },
    updateMany: async (query: {
      where: {
        id: string;
        revision?: number;
        deliveryToken?: string;
        deliveryStatus?: unknown;
        OR?: unknown;
      };
      data: Omit<Partial<ReportRow>, 'revision'> & {
        revision?: number | { increment: number };
      };
    }) => {
      const report = reports.find(candidate => candidate.id === query.where.id);
      if (!report || !canApplyUpdate(report, query)) return { count: 0 };
      const { revision, ...data } = query.data;
      Object.assign(report, data, {
        revision:
          typeof revision === 'object'
            ? report.revision + revision.increment
            : (revision ?? report.revision),
      });
      return { count: 1 };
    },
    findMany: async () =>
      reports
        .filter(report => report.deliveryStatus === TelegramReportDeliveryStatus.SENT)
        .map(report => ({ ...report, user })),
    findFirst: async (query: { where: ReportWhere }) => {
      const report = reports.find(candidate => matchesReport(candidate, query.where));
      return report ? { ...report, user } : null;
    },
  };
  const telegramReportRevision = {
    create: async (query: { data: Omit<ReportRevisionRow, 'id' | 'createdAt'> }) => {
      const revision = {
        id: `revision-${revisions.length + 1}`,
        ...query.data,
        createdAt: new Date('2026-08-03T13:00:00.000Z'),
      };
      revisions.push(revision);
      return revision;
    },
  };
  const client = {
    telegramUser: { upsert: async () => user },
    telegramReport,
    telegramReportRevision,
    $transaction: async <T>(run: (transaction: unknown) => Promise<T>) => run(client),
  };

  return { client, reports, revisions };
}

function matchesReport(report: ReportRow, where: ReportWhere): boolean {
  if (where.id && report.id !== where.id) return false;
  if (where.type) {
    if (typeof where.type === 'object') {
      if (!where.type.in.includes(report.type)) return false;
    } else if (report.type !== where.type) return false;
  }
  if (where.periodStart && report.periodStart.getTime() !== where.periodStart.getTime())
    return false;
  if (where.periodEnd && report.periodEnd.getTime() !== where.periodEnd.getTime()) return false;
  if (where.deliveryStatus && report.deliveryStatus !== where.deliveryStatus) return false;
  return where.user?.telegramId === undefined || where.user.telegramId === 123n;
}

function canApplyUpdate(
  report: ReportRow,
  query: {
    where: { revision?: number; deliveryToken?: string };
    data: Omit<Partial<ReportRow>, 'revision'> & {
      revision?: number | { increment: number };
    };
  },
): boolean {
  if (query.where.revision !== undefined) {
    return (
      report.deliveryStatus === TelegramReportDeliveryStatus.SENT &&
      report.revision === query.where.revision
    );
  }

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
  answers: unknown | null;
  configuration: unknown | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ReportRevisionRow {
  id: string;
  reportId: string;
  revision: number;
  text: string;
  answers: unknown;
  configuration: unknown;
  telegramMessageId: bigint | null;
  sentAt: Date | null;
  createdAt: Date;
}

interface ReportWhere {
  id?: string;
  type?: TelegramReportType | { in: TelegramReportType[] };
  periodStart?: Date;
  periodEnd?: Date;
  deliveryStatus?: TelegramReportDeliveryStatus;
  user?: { telegramId: bigint };
}

function field(id: string, title: string, inputType: 'text' | 'list' | 'rating' | 'boolean') {
  return { id, title, prompt: '', inputType, listStyle: null, required: true };
}
