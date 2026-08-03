import type { v1 } from '@aion/contracts';
import type {
  ReportCalendar,
  ReportFieldAnswer,
  ReportItem,
  ReportItemStatus,
} from './report.formatter.js';

export type ReportField = v1.TelegramReportField;
export type ReportFieldInputType = v1.TelegramReportFieldInputType;
export type ReportListStyle = v1.TelegramReportListStyle;
export type ReportType = 'daily' | 'weekly';

export interface ReportConfiguration {
  dailySections: ReportField[];
  weeklySections: ReportField[];
}

export interface MessageReference {
  chatId: number;
  messageId: number;
}

export interface ReportSession {
  userId: number;
  authorName: string;
  authorTag: string;
  startDate: string;
  type: ReportType | null;
  fieldIndex: number | null;
  collector: MessageReference;
  calendar: ReportCalendar;
  configuration: ReportConfiguration;
  answers: Record<ReportType, Record<string, ReportFieldAnswer>>;
  editingItemId: number | null;
  nextItemId: number;
  existingReport: v1.EditableTelegramReportDto | null;
  replaceMode: 'edit' | 'refill' | null;
}

export function createReportSession(
  userId: number,
  authorName: string,
  authorTag: string,
  startDate: string,
  collector: MessageReference,
  calendar: ReportCalendar,
  configuration: ReportConfiguration,
): ReportSession {
  const copiedConfiguration = {
    dailySections: configuration.dailySections.map(copyReportField),
    weeklySections: configuration.weeklySections.map(copyReportField),
  };

  return {
    userId,
    authorName,
    authorTag,
    startDate,
    type: null,
    fieldIndex: null,
    collector,
    calendar,
    configuration: copiedConfiguration,
    answers: {
      daily: createAnswers(copiedConfiguration.dailySections),
      weekly: createAnswers(copiedConfiguration.weeklySections),
    },
    editingItemId: null,
    nextItemId: 1,
    existingReport: null,
    replaceMode: null,
  };
}

export function copyReportField(field: ReportField): ReportField {
  return { ...field };
}

export function setReportType(session: ReportSession, type: ReportType): void {
  session.type = type;
  session.fieldIndex = 0;
  session.editingItemId = null;
  session.existingReport = null;
  session.replaceMode = null;
}

export function selectExistingReport(
  session: ReportSession,
  type: ReportType,
  report: v1.EditableTelegramReportDto,
): void {
  session.type = type;
  session.fieldIndex = null;
  session.editingItemId = null;
  session.existingReport = report;
  session.replaceMode = null;
}

export function clearExistingReportSelection(session: ReportSession): void {
  session.type = null;
  session.fieldIndex = null;
  session.editingItemId = null;
  session.existingReport = null;
  session.replaceMode = null;
}

export function editExistingReport(session: ReportSession): boolean {
  const report = session.existingReport;
  if (!report?.answers || !report.configuration || report.type === 'weekly_statistics')
    return false;
  const type = report.type;

  if (type === 'daily')
    session.configuration.dailySections = report.configuration.map(copyReportField);
  else session.configuration.weeklySections = report.configuration.map(copyReportField);
  session.answers[type] = copyAnswers(report.answers);
  session.type = type;
  session.fieldIndex = 0;
  session.editingItemId = null;
  session.nextItemId = nextAnswerItemId(session.answers[type]);
  session.replaceMode = 'edit';
  return true;
}

export function refillExistingReport(session: ReportSession): boolean {
  const report = session.existingReport;
  if (!report || report.type === 'weekly_statistics') return false;
  const type = report.type;

  session.type = type;
  session.answers[type] = createAnswers(sectionsForType(session, type));
  session.fieldIndex = 0;
  session.editingItemId = null;
  session.nextItemId = 1;
  session.replaceMode = 'refill';
  return true;
}

export function sectionsForType(session: ReportSession, type: ReportType): ReportField[] {
  return type === 'daily'
    ? session.configuration.dailySections
    : session.configuration.weeklySections;
}

export function currentField(session: ReportSession): ReportField | null {
  if (!session.type || session.fieldIndex === null) return null;
  return sectionsForType(session, session.type)[session.fieldIndex] ?? null;
}

export function currentAnswer(session: ReportSession): ReportFieldAnswer | null {
  const field = currentField(session);
  if (!field || !session.type) return null;
  return session.answers[session.type][field.id] ?? null;
}

export function currentTypeAnswers(session: ReportSession): Record<string, ReportFieldAnswer> {
  if (!session.type) return {};
  return session.answers[session.type];
}

export function advanceReportStep(session: ReportSession): boolean {
  if (!session.type || session.fieldIndex === null) return false;

  const nextIndex = session.fieldIndex + 1;
  if (nextIndex >= sectionsForType(session, session.type).length) return false;

  session.editingItemId = null;
  session.fieldIndex = nextIndex;
  return true;
}

export function retreatReportStep(session: ReportSession): void {
  if (!session.type || session.fieldIndex === null) return;

  session.editingItemId = null;
  if (session.fieldIndex === 0) {
    session.type = null;
    session.fieldIndex = null;
    return;
  }

  session.fieldIndex -= 1;
}

export function reportStepPosition(session: ReportSession): { current: number; total: number } {
  if (!session.type || session.fieldIndex === null) return { current: 0, total: 0 };
  return {
    current: session.fieldIndex + 1,
    total: sectionsForType(session, session.type).length,
  };
}

export function currentItems(session: ReportSession): ReportItem[] | null {
  if (currentField(session)?.inputType !== 'list') return null;
  return currentAnswer(session)?.items ?? null;
}

export function currentText(session: ReportSession): string | null {
  if (currentField(session)?.inputType !== 'text') return null;
  return currentAnswer(session)?.text ?? null;
}

export function setCurrentText(session: ReportSession, value: string): void {
  const answer = currentAnswer(session);
  if (currentField(session)?.inputType === 'text' && answer) answer.text = value;
}

export function isListStep(session: ReportSession): boolean {
  return currentField(session)?.inputType === 'list';
}

export function isTextStep(session: ReportSession): boolean {
  return currentField(session)?.inputType === 'text';
}

export function isRatingStep(session: ReportSession): boolean {
  return currentField(session)?.inputType === 'rating';
}

export function isBooleanStep(session: ReportSession): boolean {
  return currentField(session)?.inputType === 'boolean';
}

export function parseItems(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map(normalizeItem)
    .filter((item): item is string => item.length > 0);
}

export function normalizeItem(value: string): string {
  return value.trim().replace(/^(?:(?:[-–•])|(?:\d+[.)]))\s*/, '');
}

export function nextStatus(status: ReportItemStatus): ReportItemStatus {
  if (status === 'pending') return 'completed';
  if (status === 'completed') return 'failed';
  return 'pending';
}

export function statusMarker(status: ReportItemStatus): string {
  if (status === 'completed') return '✅';
  if (status === 'failed') return '❌';
  return '⬜';
}

export function draftCharacterCount(session: ReportSession): number {
  return Object.values(session.answers)
    .flatMap(answers => Object.values(answers))
    .reduce(
      (total, answer) => total + answer.text.length + answer.items.reduce(sumItemLength, 0),
      0,
    );
}

export function shouldKeepReportCollector(
  outcome: v1.ClaimedTelegramReportDeliveryDto['outcome'],
): boolean {
  return outcome === 'busy';
}

function createAnswers(fields: ReportField[]): Record<string, ReportFieldAnswer> {
  return Object.fromEntries(fields.map(field => [field.id, createAnswer()]));
}

function createAnswer(): ReportFieldAnswer {
  return { text: '', items: [], rating: null, boolean: null };
}

function copyAnswers(answers: v1.TelegramReportAnswers): Record<string, ReportFieldAnswer> {
  return Object.fromEntries(
    Object.entries(answers).map(([fieldId, answer]) => [
      fieldId,
      { ...answer, items: answer.items.map(item => ({ ...item })) },
    ]),
  );
}

function nextAnswerItemId(answers: Record<string, ReportFieldAnswer>): number {
  const ids = Object.values(answers).flatMap(answer => answer.items.map(item => item.id));
  return Math.max(0, ...ids) + 1;
}

function sumItemLength(total: number, item: ReportItem): number {
  return total + item.text.length;
}
