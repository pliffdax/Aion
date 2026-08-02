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
  sections: Array<
    'daily-priorities' | 'daily-event' | 'daily-conclusion' | 'daily-tomorrow' | 'daily-rating'
  >,
): string {
  const date = calendar.date.split('-').reverse().join('.');

  return [
    `<b>${date}</b>`,
    `<b>${escapeHtml(authorTag)}</b>`,
    `<b>#Неделя${calendar.week} #День${calendar.day}</b>`,
    '',
    ...joinReportSections(sections.map(section => formatDailySection(section, draft))),
  ].join('\n');
}

export function formatWeeklyReport(
  draft: WeeklyReportDraft,
  calendar: ReportCalendar,
  authorTag: string,
  sections: Array<
    'weekly-wins' | 'weekly-failure' | 'weekly-insight' | 'weekly-next' | 'weekly-review'
  >,
): string {
  return [
    `<b>Неделя ${calendar.week}</b>`,
    `<b>${escapeHtml(authorTag)} #Сводка</b>`,
    '',
    ...joinReportSections(sections.map(section => formatWeeklySection(section, draft))),
  ].join('\n');
}

function formatDailySection(
  section:
    'daily-priorities' | 'daily-event' | 'daily-conclusion' | 'daily-tomorrow' | 'daily-rating',
  draft: DailyReportDraft,
): string[] {
  switch (section) {
    case 'daily-priorities':
      return [
        '<b>Приоритет дня:</b>',
        ...draft.priorities.map(item => `– ${escapeHtml(item.text)} ${statusMarker(item.status)}`),
      ];
    case 'daily-event':
      return ['<b>Событие дня:</b>', escapeHtml(draft.event)];
    case 'daily-conclusion':
      return ['<b>Вывод дня:</b>', escapeHtml(draft.conclusion)];
    case 'daily-tomorrow':
      return [
        '<b>Главные задачи на завтра:</b>',
        ...draft.tomorrow.map(item => `– ${escapeHtml(item.text)}`),
      ];
    case 'daily-rating':
      return [`Счастье: ${draft.rating ?? 0}/10`];
  }
}

function formatWeeklySection(
  section: 'weekly-wins' | 'weekly-failure' | 'weekly-insight' | 'weekly-next' | 'weekly-review',
  draft: WeeklyReportDraft,
): string[] {
  switch (section) {
    case 'weekly-wins':
      return [
        `<b>${victoryHeading(draft.wins.length)}:</b>`,
        ...draft.wins.map((item, index) => `${index + 1}. ${escapeHtml(item.text)}`),
      ];
    case 'weekly-failure':
      return ['<b>1 провал:</b>', escapeHtml(draft.failure)];
    case 'weekly-insight':
      return ['<b>Инсайт недели:</b>', escapeHtml(draft.insight)];
    case 'weekly-next':
      return [
        '<b>План на следующую неделю:</b>',
        ...draft.nextWeek.map((item, index) => `${index + 1}. ${escapeHtml(item.text)}`),
      ];
    case 'weekly-review':
      return ['<b>Прошу на разбор:</b>', draft.requestReview ? 'Да.' : 'Нет.'];
  }
}

function joinReportSections(sections: string[][]): string[] {
  return sections.flatMap((section, index) => (index === 0 ? section : ['', ...section]));
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
