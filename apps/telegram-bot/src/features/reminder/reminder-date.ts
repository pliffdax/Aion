import type { Locale } from '../../core/i18n/i18n.js';
import { kyivTimeZone } from '../../core/time/kyiv-calendar.js';
import {
  matchesZonedDateTime,
  zonedDateTimeParts,
  zonedDateTimeToUtc,
  type LocalDateTime,
} from '../../core/time/zoned-date-time.js';

export const reminderTimezone = kyivTimeZone;
const defaultReminderHour = 9;
const exampleOffsetMinutes = 5;

interface ParsedReminderDate {
  ok: true;
  remindAt: Date;
  usedDefaultTime: boolean;
}

interface InvalidReminderDate {
  ok: false;
  reason: 'format' | 'past';
}

export type ReminderDateParseResult = ParsedReminderDate | InvalidReminderDate;

export interface ReminderDateExamples {
  dateTime: string;
  dateOnly: string;
}

const dateInputPattern =
  /^(?<day>\d{1,2})\.(?<month>\d{1,2})\.(?<year>\d{4})(?:\s+(?<hour>\d{1,2}):(?<minute>\d{2}))?$/;

export function parseReminderDateInput(input: string, now = new Date()): ReminderDateParseResult {
  const match = dateInputPattern.exec(input.trim());
  if (!match?.groups) return { ok: false, reason: 'format' };

  const localDateTime = localDateTimeFromGroups(match.groups);
  const usedDefaultTime = match.groups.hour === undefined;

  if (!isValidCalendarInput(localDateTime)) {
    return { ok: false, reason: 'format' };
  }

  const remindAt = zonedDateTimeToUtc(localDateTime, reminderTimezone);

  if (!matchesZonedDateTime(remindAt, localDateTime, reminderTimezone)) {
    return { ok: false, reason: 'format' };
  }

  if (remindAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'past' };
  }

  return { ok: true, remindAt, usedDefaultTime };
}

export function formatReminderDate(
  value: Date | string,
  locale: Locale,
  timezone = reminderTimezone,
): string {
  return new Intl.DateTimeFormat(localeName(locale), {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

export function reminderDateExamples(now = new Date()): ReminderDateExamples {
  const dateTime = zonedDateTimeParts(
    new Date(now.getTime() + exampleOffsetMinutes * 60_000),
    reminderTimezone,
  );
  const current = zonedDateTimeParts(now, reminderTimezone);
  const dateOnly = current.hour < defaultReminderHour ? current : shiftLocalDate(current, 1);

  return {
    dateTime: formatInputDate(dateTime, true),
    dateOnly: formatInputDate(dateOnly, false),
  };
}

function isValidCalendarInput(value: LocalDateTime): boolean {
  const bounds = [
    value.year >= 1970,
    value.month >= 1,
    value.month <= 12,
    value.hour >= 0,
    value.hour <= 23,
    value.minute >= 0,
    value.minute <= 59,
  ];
  if (!bounds.every(Boolean)) return false;

  const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
  return [
    date.getUTCFullYear() === value.year,
    date.getUTCMonth() === value.month - 1,
    date.getUTCDate() === value.day,
  ].every(Boolean);
}

function localDateTimeFromGroups(groups: Record<string, string | undefined>): LocalDateTime {
  const hasTime = groups.hour !== undefined;

  return {
    year: Number(groups.year),
    month: Number(groups.month),
    day: Number(groups.day),
    hour: hasTime ? Number(groups.hour) : defaultReminderHour,
    minute: hasTime ? Number(groups.minute) : 0,
  };
}

function shiftLocalDate(value: LocalDateTime, days: number): LocalDateTime {
  const shifted = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: value.hour,
    minute: value.minute,
  };
}

function formatInputDate(value: LocalDateTime, includeTime: boolean): string {
  const date = `${pad(value.day)}.${pad(value.month)}.${value.year}`;
  return includeTime ? `${date} ${pad(value.hour)}:${pad(value.minute)}` : date;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function localeName(locale: Locale): string {
  const names: Record<Locale, string> = {
    ru: 'ru-RU',
    uk: 'uk-UA',
    en: 'en-GB',
  };

  return names[locale];
}
