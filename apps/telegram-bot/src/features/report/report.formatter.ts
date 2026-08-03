import type { v1 } from '@aion/contracts';
import { escapeHtml } from '../../core/formatting/html.js';

const millisecondsPerDay = 86_400_000;

export type ReportItemStatus = 'pending' | 'completed' | 'failed';

export interface ReportItem {
  id: number;
  text: string;
  status: ReportItemStatus;
}

export interface ReportFieldAnswer {
  text: string;
  items: ReportItem[];
  rating: number | null;
  boolean: boolean | null;
}

export interface ReportCalendar {
  date: string;
  week: number;
  day: number;
}

export interface ReportPeriod {
  periodStart: string;
  periodEnd: string;
}

export function calculateReportCalendar(date: string, startDate: string): ReportCalendar {
  const elapsedDays = Math.floor(
    (Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
      millisecondsPerDay,
  );

  if (elapsedDays < 0) {
    throw new Error('Report date is earlier than the user report start date');
  }

  return {
    date,
    week: Math.floor(elapsedDays / 7) + 1,
    day: (elapsedDays % 7) + 1,
  };
}

export function calculateReportPeriod(
  type: 'daily' | 'weekly',
  calendar: ReportCalendar,
  startDate: string,
): ReportPeriod {
  if (type === 'daily') {
    return { periodStart: calendar.date, periodEnd: calendar.date };
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + (calendar.week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

export function formatDailyReport(
  answers: Record<string, ReportFieldAnswer>,
  calendar: ReportCalendar,
  authorTag: string,
  fields: v1.TelegramReportField[],
): string {
  const date = calendar.date.split('-').reverse().join('.');

  return [
    `<b>${date}</b>`,
    `<b>${escapeHtml(authorTag)}</b>`,
    `<b>#Неделя${calendar.week} #День${calendar.day}</b>`,
    '',
    ...formatFields(fields, answers),
  ].join('\n');
}

export function formatWeeklyReport(
  answers: Record<string, ReportFieldAnswer>,
  calendar: ReportCalendar,
  authorTag: string,
  fields: v1.TelegramReportField[],
): string {
  return [
    `<b>Неделя ${calendar.week}</b>`,
    `<b>${escapeHtml(authorTag)} #Сводка</b>`,
    '',
    ...formatFields(fields, answers),
  ].join('\n');
}

function formatFields(
  fields: v1.TelegramReportField[],
  answers: Record<string, ReportFieldAnswer>,
): string[] {
  const lines: string[] = [];

  for (const field of fields) {
    const answer = answers[field.id] ?? emptyAnswer();
    if (!field.required && !hasAnswer(field, answer)) continue;

    if (lines.length > 0) lines.push('');
    lines.push(...formatField(field, answer));
  }

  return lines;
}

function hasAnswer(field: v1.TelegramReportField, answer: ReportFieldAnswer): boolean {
  switch (field.inputType) {
    case 'text':
      return answer.text.trim().length > 0;
    case 'list':
      return answer.items.length > 0;
    case 'rating':
      return answer.rating !== null;
    case 'boolean':
      return answer.boolean !== null;
  }
}

function formatField(field: v1.TelegramReportField, answer: ReportFieldAnswer): string[] {
  const title = escapeHtml(field.title);

  switch (field.inputType) {
    case 'text':
      return [`<b>${title}:</b>`, escapeHtml(answer.text)];
    case 'list':
      return [`<b>${title}:</b>`, ...formatList(field.listStyle, answer.items)];
    case 'rating':
      return [`${title}: ${answer.rating ?? 0}/10`];
    case 'boolean':
      return [`<b>${title}:</b>`, answer.boolean ? 'Да.' : 'Нет.'];
  }
}

function formatList(style: v1.TelegramReportListStyle | null, items: ReportItem[]): string[] {
  return items.map((item, index) => {
    const text = escapeHtml(item.text);
    if (style === 'numbered') return `${index + 1}. ${text}`;
    if (style === 'status') return `– ${text} ${statusMarker(item.status)}`;
    return `– ${text}`;
  });
}

function statusMarker(status: ReportItemStatus): string {
  switch (status) {
    case 'completed':
      return '✅';
    case 'failed':
      return '❌';
    default:
      return '⬜';
  }
}

function emptyAnswer(): ReportFieldAnswer {
  return { text: '', items: [], rating: null, boolean: null };
}
