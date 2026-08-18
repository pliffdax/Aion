import type { v1 } from '@aion/contracts';
import { InlineKeyboard, type Api as TelegramApi } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import { getLocale, translate, type Locale } from '../../core/i18n/i18n.js';
import {
  currentKyivDateKey,
  formatDateKeyInput,
  shiftDateKey,
} from '../../core/time/kyiv-calendar.js';
import {
  calculateReportCalendar,
  calculateReportPeriod,
  formatDailyReport,
  formatWeeklyReport,
  type ReportCalendar,
  type ReportPeriod,
} from './report.formatter.js';
import type { ReportSession } from './report.session.js';
import { buildExistingReportKeyboard, renderExistingReportMenu } from './report.view.js';

export function startMovingReportDate(session: ReportSession): boolean {
  const report = session.existingReport;
  if (!isMovableReport(report) || !report.answers || !report.configuration || session.replaceMode) {
    return false;
  }

  session.movingReportDate = true;
  return true;
}

export async function showReportDateMove(
  telegramApi: TelegramApi,
  session: ReportSession,
  error?: string,
): Promise<void> {
  const report = session.existingReport;
  if (!isMovableReport(report)) {
    throw new Error('An editable report is required to move');
  }
  const locale = getLocale(session.userId);
  const prompt = renderReportDateMovePrompt(locale, report);

  await telegramApi.editMessageText(
    session.collector.chatId,
    session.collector.messageId,
    error ? `${error}\n\n${prompt}` : prompt,
    {
      parse_mode: 'HTML',
      reply_markup: buildReportDateMoveKeyboard(locale, report, session.startDate),
    },
  );
}

export async function moveReportToDate(
  telegramApi: TelegramApi,
  apiClient: AionApiClient,
  session: ReportSession,
  targetDate: string,
): Promise<boolean> {
  const existing = movableReport(session);
  if (!existing) return false;

  const target = resolveReportMoveTarget(session, existing.type, targetDate);
  if (typeof target === 'string') {
    await showReportDateMove(telegramApi, session, target);
    return false;
  }

  const targetError = await reportMoveTargetError(apiClient, session, existing, target);
  if (targetError) {
    await showReportDateMove(telegramApi, session, targetError);
    return false;
  }

  const locale = getLocale(session.userId);
  const text = formatMovedReport(existing, target.calendar, session.authorTag);
  const messageUpdate = await updateReportMessage(telegramApi, session, existing, text);

  let moved: v1.EditableTelegramReportDto;
  try {
    moved = await apiClient.moveReportPeriod(session.userId, {
      reportId: existing.id,
      expectedRevision: existing.revision,
      type: existing.type,
      periodStart: target.period.periodStart,
      periodEnd: target.period.periodEnd,
      text,
      telegramMessageId: String(messageUpdate.messageId),
    });
  } catch (error) {
    await rollBackReportMessage(telegramApi, session, existing, messageUpdate);
    await showReportDateMove(
      telegramApi,
      session,
      translate(
        locale,
        isApiConflict(error) ? reportMoveConflictKey(existing.type) : 'report.moveDateFailed',
      ),
    );
    return false;
  }

  await completeReportDateMove(telegramApi, session, moved, target.calendar, messageUpdate);
  return true;
}

interface ReportMessageUpdate {
  messageId: number;
  previousMessageId: number | null;
  editedPrevious: boolean;
}

async function updateReportMessage(
  telegramApi: TelegramApi,
  session: ReportSession,
  report: v1.EditableTelegramReportDto,
  text: string,
): Promise<ReportMessageUpdate> {
  const parsedMessageId = Number(report.telegramMessageId);
  const previousMessageId =
    Number.isSafeInteger(parsedMessageId) && parsedMessageId > 0 ? parsedMessageId : null;
  const editedPrevious = previousMessageId
    ? await telegramApi
        .editMessageText(session.collector.chatId, previousMessageId, text, { parse_mode: 'HTML' })
        .then(() => true)
        .catch(() => false)
    : false;

  if (editedPrevious && previousMessageId) {
    return { messageId: previousMessageId, previousMessageId, editedPrevious };
  }

  const message = await telegramApi.sendMessage(session.collector.chatId, text, {
    parse_mode: 'HTML',
  });
  return { messageId: message.message_id, previousMessageId, editedPrevious: false };
}

async function rollBackReportMessage(
  telegramApi: TelegramApi,
  session: ReportSession,
  report: v1.EditableTelegramReportDto,
  update: ReportMessageUpdate,
): Promise<void> {
  if (update.editedPrevious && update.previousMessageId) {
    await telegramApi
      .editMessageText(session.collector.chatId, update.previousMessageId, report.text, {
        parse_mode: 'HTML',
      })
      .catch(() => undefined);
    return;
  }

  await telegramApi
    .deleteMessage(session.collector.chatId, update.messageId)
    .catch(() => undefined);
}

async function removeReplacedReportMessage(
  telegramApi: TelegramApi,
  session: ReportSession,
  update: ReportMessageUpdate,
): Promise<void> {
  if (!update.editedPrevious && update.previousMessageId !== null) {
    await telegramApi
      .deleteMessage(session.collector.chatId, update.previousMessageId)
      .catch(() => undefined);
  }
}

async function completeReportDateMove(
  telegramApi: TelegramApi,
  session: ReportSession,
  moved: v1.EditableTelegramReportDto,
  calendar: ReportCalendar,
  messageUpdate: ReportMessageUpdate,
): Promise<void> {
  await removeReplacedReportMessage(telegramApi, session, messageUpdate);
  session.existingReport = moved;
  session.calendar = calendar;
  session.movingReportDate = false;
  const locale = getLocale(session.userId);
  await telegramApi.editMessageText(
    session.collector.chatId,
    session.collector.messageId,
    renderMovedReportMenu(locale, moved),
    {
      parse_mode: 'HTML',
      reply_markup: buildExistingReportKeyboard(locale, moved.type),
    },
  );
}

function movableReport(session: ReportSession):
  | (v1.EditableTelegramReportDto & {
      type: 'daily' | 'weekly';
      answers: v1.TelegramReportAnswers;
      configuration: v1.TelegramReportField[];
    })
  | null {
  const report = session.existingReport;
  if (
    !session.movingReportDate ||
    !isMovableReport(report) ||
    !report.answers ||
    !report.configuration
  ) {
    return null;
  }
  return {
    ...report,
    type: report.type,
    answers: report.answers,
    configuration: report.configuration,
  };
}

interface ReportMoveTarget {
  calendar: ReportCalendar;
  period: ReportPeriod;
}

function resolveReportMoveTarget(
  session: ReportSession,
  type: 'daily' | 'weekly',
  targetDate: string,
): ReportMoveTarget | string {
  const locale = getLocale(session.userId);
  if (targetDate < session.startDate) return translate(locale, 'report.moveDateBeforeStart');

  const calendar = calculateReportCalendar(targetDate, session.startDate);
  const period = calculateReportPeriod(type, calendar, session.startDate);
  if (isCurrentReportPeriod(session, period)) {
    return translate(locale, reportMoveSameKey(type));
  }

  const currentCalendar = calculateReportCalendar(currentKyivDateKey(), session.startDate);
  const currentPeriod = calculateReportPeriod(type, currentCalendar, session.startDate);
  if (period.periodStart > currentPeriod.periodStart) {
    return translate(locale, reportMoveFutureKey(type));
  }
  return { calendar, period };
}

async function reportMoveTargetError(
  apiClient: AionApiClient,
  session: ReportSession,
  sourceReport: v1.EditableTelegramReportDto & { type: 'daily' | 'weekly' },
  target: ReportMoveTarget,
): Promise<string | null> {
  const targetReport = await apiClient
    .findEditableReport(session.userId, {
      type: sourceReport.type,
      periodStart: target.period.periodStart,
      periodEnd: target.period.periodEnd,
    })
    .catch(() => undefined);
  if (targetReport === undefined) {
    return translate(getLocale(session.userId), 'report.moveDateFailed');
  }
  return targetReport && targetReport.id !== sourceReport.id
    ? translate(getLocale(session.userId), reportMoveConflictKey(sourceReport.type))
    : null;
}

function renderReportDateMovePrompt(
  locale: Locale,
  report: v1.EditableTelegramReportDto & { type: 'daily' | 'weekly' },
): string {
  const weekly = report.type === 'weekly';
  return [
    translate(locale, weekly ? 'report.moveWeekTitle' : 'report.moveDateTitle'),
    '',
    weekly
      ? translate(locale, 'report.moveWeekSource', {
          start: formatReportDate(report.periodStart),
          end: formatReportDate(report.periodEnd),
        })
      : translate(locale, 'report.moveDateSource', { date: formatReportDate(report.periodStart) }),
    '',
    translate(locale, weekly ? 'report.moveWeekPrompt' : 'report.moveDatePrompt', {
      example: formatDateKeyInput(shiftDateKey(currentKyivDateKey(), -1)),
    }),
  ].join('\n');
}

function buildReportDateMoveKeyboard(
  locale: Locale,
  report: v1.EditableTelegramReportDto & { type: 'daily' | 'weekly' },
  startDate: string,
): InlineKeyboard {
  const today = currentKyivDateKey();
  const keyboard = new InlineKeyboard();
  const quickDates = (
    report.type === 'daily'
      ? [
          { label: translate(locale, 'report.yesterday'), date: shiftDateKey(today, -1) },
          { label: translate(locale, 'daily.today'), date: today },
        ]
      : [
          { label: translate(locale, 'report.previousWeek'), date: shiftDateKey(today, -7) },
          { label: translate(locale, 'report.currentWeek'), date: today },
        ]
  ).filter(candidate => {
    if (candidate.date < startDate) return false;
    const calendar = calculateReportCalendar(candidate.date, startDate);
    const period = calculateReportPeriod(report.type, calendar, startDate);
    return period.periodStart !== report.periodStart || period.periodEnd !== report.periodEnd;
  });

  for (const candidate of quickDates) {
    keyboard.text(candidate.label, `report:move-date:quick:${candidate.date}`).row();
  }

  return keyboard.text(translate(locale, 'report.cancel'), 'report:move-date:cancel');
}

function renderMovedReportMenu(locale: Locale, report: v1.EditableTelegramReportDto): string {
  return [
    report.type === 'weekly'
      ? translate(locale, 'report.moveWeekSuccess', {
          start: formatReportDate(report.periodStart),
          end: formatReportDate(report.periodEnd),
        })
      : translate(locale, 'report.moveDateSuccess', { date: formatReportDate(report.periodStart) }),
    '',
    renderExistingReportMenu(locale, report),
  ].join('\n');
}

function formatReportDate(date: string): string {
  return date.split('-').reverse().join('.');
}

function isApiConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes('failed with 409');
}

function formatMovedReport(
  report: NonNullable<ReturnType<typeof movableReport>>,
  calendar: ReportCalendar,
  authorTag: string,
): string {
  const formatter = report.type === 'daily' ? formatDailyReport : formatWeeklyReport;
  return formatter(report.answers, calendar, authorTag, report.configuration);
}

function isCurrentReportPeriod(session: ReportSession, period: ReportPeriod): boolean {
  const current = session.existingReport;
  return current?.periodStart === period.periodStart && current.periodEnd === period.periodEnd;
}

function reportMoveSameKey(
  type: 'daily' | 'weekly',
): 'report.moveDateSame' | 'report.moveWeekSame' {
  return type === 'daily' ? 'report.moveDateSame' : 'report.moveWeekSame';
}

function reportMoveFutureKey(
  type: 'daily' | 'weekly',
): 'report.moveDateFuture' | 'report.moveWeekFuture' {
  return type === 'daily' ? 'report.moveDateFuture' : 'report.moveWeekFuture';
}

function reportMoveConflictKey(
  type: 'daily' | 'weekly',
): 'report.moveDateConflict' | 'report.moveWeekConflict' {
  return type === 'daily' ? 'report.moveDateConflict' : 'report.moveWeekConflict';
}

function isMovableReport(
  report: v1.EditableTelegramReportDto | null,
): report is v1.EditableTelegramReportDto & { type: 'daily' | 'weekly' } {
  return report !== null && report.type !== 'weekly_statistics';
}
