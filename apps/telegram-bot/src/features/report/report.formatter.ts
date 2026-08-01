import { escapeHtml } from '../../core/formatting/html.js';

const millisecondsPerDay = 86_400_000;

export type ReportItemStatus = 'pending' | 'completed' | 'failed';

export interface ReportItem {
  id: number;
  text: string;
  status: ReportItemStatus;
}

export interface ReportCalendar {
  date: string;
  week: number;
  day: number;
}

export interface DailyReportDraft {
  priorities: ReportItem[];
  event: string;
  conclusion: string;
  tomorrow: ReportItem[];
  rating: number | null;
}

export interface WeeklyReportDraft {
  wins: ReportItem[];
  failure: string;
  insight: string;
  nextWeek: ReportItem[];
  requestReview: boolean | null;
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

export function formatDailyReport(
  draft: DailyReportDraft,
  calendar: ReportCalendar,
  authorTag: string,
): string {
  const date = calendar.date.split('-').reverse().join('.');

  return [
    `<b>${date}</b>`,
    `<b>${escapeHtml(authorTag)}</b>`,
    `<b>#Неделя${calendar.week} #День${calendar.day}</b>`,
    '',
    '<b>Приоритет дня:</b>',
    ...draft.priorities.map(item => `– ${escapeHtml(item.text)} ${statusMarker(item.status)}`),
    '',
    '<b>Событие дня:</b>',
    escapeHtml(draft.event),
    '',
    '<b>Вывод дня:</b>',
    escapeHtml(draft.conclusion),
    '',
    '<b>Главная задача на завтра:</b>',
    ...draft.tomorrow.map(item => `– ${escapeHtml(item.text)}`),
    '',
    `Счастье: ${draft.rating ?? 0}/10`,
  ].join('\n');
}

export function formatWeeklyReport(
  draft: WeeklyReportDraft,
  calendar: ReportCalendar,
  authorTag: string,
): string {
  return [
    `<b>Неделя ${calendar.week}</b>`,
    `<b>${escapeHtml(authorTag)} #Сводка</b>`,
    '',
    `<b>${victoryHeading(draft.wins.length)}:</b>`,
    ...draft.wins.map((item, index) => `${index + 1}. ${escapeHtml(item.text)}`),
    '',
    '<b>1 провал:</b>',
    escapeHtml(draft.failure),
    '',
    '<b>Инсайт недели:</b>',
    escapeHtml(draft.insight),
    '',
    '<b>План на следующую неделю:</b>',
    ...draft.nextWeek.map((item, index) => `${index + 1}. ${escapeHtml(item.text)}`),
    '',
    '<b>Прошу на разбор:</b>',
    draft.requestReview ? 'Да.' : 'Нет.',
  ].join('\n');
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

function victoryHeading(count: number): string {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${count} побед`;
  if (lastDigit === 1) return `${count} победа`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} победы`;
  return `${count} побед`;
}
