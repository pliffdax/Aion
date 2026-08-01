import type { v1 } from '@aion/contracts';
import { escapeHtml } from '../../core/formatting/html.js';
import { dateLocale, translate, type Locale } from '../../core/i18n/i18n.js';
import { kyivTimeZone } from '../../core/time/kyiv-calendar.js';

type WeekdayCase = 'summary' | 'target';

const weekdayNames: Record<Locale, Record<WeekdayCase, readonly string[]>> = {
  ru: {
    summary: ['воскресенья', 'понедельника', 'вторника', 'среды', 'четверга', 'пятницы', 'субботы'],
    target: ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'],
  },
  uk: {
    summary: ['неділі', 'понеділка', 'вівторка', 'середи', 'четверга', 'п’ятниці', 'суботи'],
    target: ['неділю', 'понеділок', 'вівторок', 'середу', 'четвер', 'п’ятницю', 'суботу'],
  },
  en: {
    summary: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    target: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  },
};

export function renderDailyPlanSummary(claim: v1.ClaimedTelegramDailyPlanRolloverDto): string {
  const { sourcePlan, targetPlan, locale } = claim;
  const completed = sourcePlan.items.filter(item => item.completed);
  const carried = sourcePlan.items.filter(item => !item.completed);
  const sourceDate = formatPlanDate(sourcePlan.date, locale, 'summary');
  const targetDate = formatPlanDate(targetPlan.date, locale, 'target');

  return [
    `<b>${translate(locale, 'daily.summaryTitle', { date: sourceDate })}</b>`,
    '',
    translate(locale, 'daily.summaryProgress', {
      completed: completed.length,
      total: sourcePlan.items.length,
    }),
    '',
    `<b>${translate(locale, 'daily.summaryCompletedTitle')}</b>`,
    ...summaryItems(completed, '✅', translate(locale, 'daily.summaryNoneCompleted')),
    '',
    `<b>${translate(locale, 'daily.summaryCarriedTitle', { date: targetDate })}</b>`,
    ...summaryItems(carried, '↪️', translate(locale, 'daily.summaryNoneCarried')),
  ].join('\n');
}

function summaryItems(
  items: v1.TelegramDailyPlanItemDto[],
  marker: string,
  emptyText: string,
): string[] {
  if (items.length === 0) return [`<i>${emptyText}</i>`];
  return items.map(item => `${marker} ${escapeHtml(item.text)}`);
}

function formatPlanDate(date: string, locale: Locale, weekdayCase: WeekdayCase): string {
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  const calendarDate = new Intl.DateTimeFormat(dateLocale(locale), {
    timeZone: kyivTimeZone,
    day: 'numeric',
    month: 'long',
  }).format(parsedDate);
  const weekday = weekdayNames[locale][weekdayCase][parsedDate.getUTCDay()];

  return `${weekday}, ${calendarDate}`;
}
