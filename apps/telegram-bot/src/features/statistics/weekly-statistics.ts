import type { v1 } from '@aion/contracts';
import { InlineKeyboard } from 'grammy';
import { escapeHtml } from '../../core/formatting/html.js';
import { dateLocale, translate, type Locale } from '../../core/i18n/i18n.js';
import { shiftDateKey } from '../../core/time/kyiv-calendar.js';

export function latestCompletedWeekStart(dateKey: string): string {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  const mondayOffset = (day + 6) % 7;
  return shiftDateKey(dateKey, -mondayOffset - 7);
}

export function weeklyStatisticsPeriodEnd(periodStart: string): string {
  return shiftDateKey(periodStart, 6);
}

export function renderWeeklyStatistics(statistics: v1.TelegramWeeklyPlanStatisticsDto): string {
  const locale = statistics.locale;
  const lines = [
    translate(locale, 'statistics.weeklyTitle'),
    translate(locale, 'statistics.period', {
      start: formatDate(locale, statistics.periodStart),
      end: formatDate(locale, statistics.periodEnd),
    }),
    '',
    translate(locale, 'statistics.tasks', { count: statistics.taskCount }),
    translate(locale, 'statistics.completed', {
      completed: statistics.completedCount,
      total: statistics.taskCount,
      rate: statistics.completionRate,
    }),
    translate(locale, 'statistics.unfinished', { count: statistics.unfinishedCount }),
    translate(locale, 'statistics.carries', { count: statistics.carryEventCount }),
    '',
  ];

  if (statistics.mostCarriedItems.length === 0) {
    lines.push(translate(locale, 'statistics.noCarried'));
  } else {
    lines.push(translate(locale, 'statistics.mostCarried'));
    lines.push(
      ...statistics.mostCarriedItems.map(
        item => `${item.completed ? '✅' : '↪️'} ${item.carryCount}× ${escapeHtml(item.text)}`,
      ),
    );
  }

  return lines.join('\n');
}

export function buildWeeklyStatisticsKeyboard(
  locale: Locale,
  periodStart: string,
  latestPeriodStart: string,
): InlineKeyboard {
  const keyboard = new InlineKeyboard().text(
    translate(locale, 'statistics.previous'),
    `statistics:week:${shiftDateKey(periodStart, -7)}`,
  );

  if (periodStart < latestPeriodStart) {
    keyboard.text(
      translate(locale, 'statistics.next'),
      `statistics:week:${shiftDateKey(periodStart, 7)}`,
    );
  }

  return keyboard;
}

function formatDate(locale: Locale, dateKey: string): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}
