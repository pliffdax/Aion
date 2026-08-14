import type { v1 } from '@aion/contracts';
import { InlineKeyboard, type Api as TelegramApi } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import { getLocale, translate, type Locale } from '../../core/i18n/i18n.js';
import {
  currentKyivDateKey,
  formatDateKeyInput,
  shiftDateKey,
} from '../../core/time/kyiv-calendar.js';
import { calculateReportCalendar, formatDailyReport } from './report.formatter.js';
import type { ReportSession } from './report.session.js';
import { buildExistingReportKeyboard, renderExistingReportMenu } from './report.view.js';

export function startMovingReportDate(session: ReportSession): boolean {
  const report = session.existingReport;
  if (
    !report ||
    report.type !== 'daily' ||
    !report.answers ||
    !report.configuration ||
    session.replaceMode
  ) {
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
  if (!report || report.type !== 'daily') throw new Error('A daily report is required to move');
  const locale = getLocale(session.userId);
  const prompt = renderReportDateMovePrompt(locale, report.periodStart);

  await telegramApi.editMessageText(
    session.collector.chatId,
    session.collector.messageId,
    error ? `${error}\n\n${prompt}` : prompt,
    {
      parse_mode: 'HTML',
      reply_markup: buildReportDateMoveKeyboard(locale, report.periodStart),
    },
  );
}

export async function moveDailyReportToDate(
  telegramApi: TelegramApi,
  apiClient: AionApiClient,
  session: ReportSession,
  targetDate: string,
): Promise<boolean> {
  const existing = movableDailyReport(session);
  if (!existing) return false;

  const targetError = await reportMoveTargetError(apiClient, session, existing.id, targetDate);
  if (targetError) {
    await showReportDateMove(telegramApi, session, targetError);
    return false;
  }

  const locale = getLocale(session.userId);
  const calendar = calculateReportCalendar(targetDate, session.startDate);
  const text = formatDailyReport(
    existing.answers,
    calendar,
    session.authorTag,
    existing.configuration,
  );
  const messageUpdate = await updateReportMessage(telegramApi, session, existing, text);

  let moved: v1.EditableTelegramReportDto;
  try {
    moved = await apiClient.moveDailyReport(session.userId, {
      reportId: existing.id,
      expectedRevision: existing.revision,
      targetDate,
      text,
      telegramMessageId: String(messageUpdate.messageId),
    });
  } catch (error) {
    await rollBackReportMessage(telegramApi, session, existing, messageUpdate);
    await showReportDateMove(
      telegramApi,
      session,
      translate(locale, isApiConflict(error) ? 'report.moveDateConflict' : 'report.moveDateFailed'),
    );
    return false;
  }

  await completeReportDateMove(telegramApi, session, moved, calendar, messageUpdate);
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
  calendar: ReturnType<typeof calculateReportCalendar>,
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

function movableDailyReport(session: ReportSession):
  | (v1.EditableTelegramReportDto & {
      type: 'daily';
      answers: v1.TelegramReportAnswers;
      configuration: v1.TelegramReportField[];
    })
  | null {
  const report = session.existingReport;
  if (
    !session.movingReportDate ||
    !report ||
    report.type !== 'daily' ||
    !report.answers ||
    !report.configuration
  ) {
    return null;
  }
  return {
    ...report,
    type: 'daily',
    answers: report.answers,
    configuration: report.configuration,
  };
}

function reportDateMoveValidationError(session: ReportSession, targetDate: string): string | null {
  const locale = getLocale(session.userId);
  if (targetDate === session.existingReport?.periodStart) {
    return translate(locale, 'report.moveDateSame');
  }
  if (targetDate > currentKyivDateKey()) return translate(locale, 'report.moveDateFuture');
  if (targetDate < session.startDate) return translate(locale, 'report.moveDateBeforeStart');
  return null;
}

async function reportMoveTargetError(
  apiClient: AionApiClient,
  session: ReportSession,
  sourceReportId: string,
  targetDate: string,
): Promise<string | null> {
  const validationError = reportDateMoveValidationError(session, targetDate);
  if (validationError) return validationError;

  const targetReport = await apiClient
    .findEditableReport(session.userId, {
      type: 'daily',
      periodStart: targetDate,
      periodEnd: targetDate,
    })
    .catch(() => undefined);
  if (targetReport === undefined) {
    return translate(getLocale(session.userId), 'report.moveDateFailed');
  }
  return targetReport && targetReport.id !== sourceReportId
    ? translate(getLocale(session.userId), 'report.moveDateConflict')
    : null;
}

function renderReportDateMovePrompt(locale: Locale, sourceDate: string): string {
  return [
    translate(locale, 'report.moveDateTitle'),
    '',
    translate(locale, 'report.moveDateSource', { date: formatReportDate(sourceDate) }),
    '',
    translate(locale, 'report.moveDatePrompt', {
      example: formatDateKeyInput(shiftDateKey(currentKyivDateKey(), -1)),
    }),
  ].join('\n');
}

function buildReportDateMoveKeyboard(locale: Locale, sourceDate: string): InlineKeyboard {
  const today = currentKyivDateKey();
  const keyboard = new InlineKeyboard();
  const quickDates = [
    { label: translate(locale, 'report.yesterday'), date: shiftDateKey(today, -1) },
    { label: translate(locale, 'daily.today'), date: today },
  ].filter(candidate => candidate.date !== sourceDate);

  for (const candidate of quickDates) {
    keyboard.text(candidate.label, `report:move-date:quick:${candidate.date}`).row();
  }

  return keyboard.text(translate(locale, 'report.cancel'), 'report:move-date:cancel');
}

function renderMovedReportMenu(locale: Locale, report: v1.EditableTelegramReportDto): string {
  return [
    translate(locale, 'report.moveDateSuccess', { date: formatReportDate(report.periodStart) }),
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
