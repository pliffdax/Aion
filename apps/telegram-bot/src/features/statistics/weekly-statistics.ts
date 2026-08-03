import type { v1 } from '@aion/contracts';
import { InlineKeyboard } from 'grammy';
import { escapeHtml } from '../../core/formatting/html.js';
import { translate, type Locale } from '../../core/i18n/i18n.js';
import { shiftDateKey } from '../../core/time/kyiv-calendar.js';

export function latestCompletedWeekStart(dateKey: string): string {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  const mondayOffset = (day + 6) % 7;
  return shiftDateKey(dateKey, -mondayOffset - 7);
}

export function weekStartContainingDate(dateKey: string): string {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return shiftDateKey(dateKey, -((day + 6) % 7));
}

export function parseStatisticsDateInput(input: string): string | null {
  const value = input.trim();
  const localized = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const year = Number(localized?.[3] ?? iso?.[1]);
  const month = Number(localized?.[2] ?? iso?.[2]);
  const day = Number(localized?.[1] ?? iso?.[3]);

  if (!localized && !iso) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

export function formatStatisticsDateInput(dateKey: string): string {
  const [year, month, day] = dateKey.split('-');
  return `${day}.${month}.${year}`;
}

export function weeklyStatisticsPeriodEnd(periodStart: string): string {
  return shiftDateKey(periodStart, 6);
}

export function renderWeeklyStatistics(statistics: v1.TelegramWeeklyPlanStatisticsDto): string {
  const locale = statistics.locale;
  const lines = [
    translate(locale, 'statistics.weeklyTitle'),
    translate(locale, 'statistics.period', {
      start: formatDate(statistics.periodStart),
      end: formatDate(statistics.periodEnd),
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

  keyboard.text(translate(locale, 'statistics.chooseDate'), `statistics:date:${periodStart}`);

  if (periodStart < latestPeriodStart) {
    keyboard.text(
      translate(locale, 'statistics.next'),
      `statistics:week:${shiftDateKey(periodStart, 7)}`,
    );
  }

  if (periodStart < shiftDateKey(latestPeriodStart, -7)) {
    keyboard
      .row()
      .text(translate(locale, 'statistics.latest'), `statistics:week:${latestPeriodStart}`);
  }

  return keyboard;
}

function formatDate(dateKey: string): string {
  return formatStatisticsDateInput(dateKey);
}
