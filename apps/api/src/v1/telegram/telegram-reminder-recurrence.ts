import { TelegramReminderRepeatType } from '@/generated/prisma/client';

interface ReminderRecurrenceSchedule {
  repeatType: TelegramReminderRepeatType;
  repeatIntervalMinutes: number | null;
  recurrenceAnchorAt: Date;
  timezone: string;
}

interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function nextReminderOccurrence(
  reminder: ReminderRecurrenceSchedule,
  after: Date,
): Date | null {
  const anchor = zonedDateTimeParts(reminder.recurrenceAnchorAt, reminder.timezone);

  switch (reminder.repeatType) {
    case TelegramReminderRepeatType.NONE:
      return null;
    case TelegramReminderRepeatType.INTERVAL:
      return nextIntervalOccurrence(reminder, after);
    case TelegramReminderRepeatType.DAILY:
      return nextDailyOccurrence(anchor, after, reminder.timezone);
    case TelegramReminderRepeatType.WEEKLY:
      return nextWeeklyOccurrence(anchor, after, reminder.timezone);
    case TelegramReminderRepeatType.MONTHLY:
      return nextMonthlyOccurrence(anchor, after, reminder.timezone);
    case TelegramReminderRepeatType.YEARLY:
      return nextYearlyOccurrence(anchor, after, reminder.timezone);
  }
}

function nextIntervalOccurrence(reminder: ReminderRecurrenceSchedule, after: Date): Date {
  if (!reminder.repeatIntervalMinutes) {
    throw new Error('Recurring interval reminder has no interval');
  }

  const intervalMs = reminder.repeatIntervalMinutes * 60_000;
  const elapsedMs = after.getTime() - reminder.recurrenceAnchorAt.getTime();
  const intervalsElapsed = Math.max(0, Math.floor(elapsedMs / intervalMs) + 1);

  return new Date(reminder.recurrenceAnchorAt.getTime() + intervalsElapsed * intervalMs);
}

function nextDailyOccurrence(anchor: LocalDateTime, after: Date, timezone: string): Date {
  let localDate = dateOnly(zonedDateTimeParts(after, timezone));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = occurrenceOn(localDate, anchor, timezone);
    if (candidate.getTime() > after.getTime()) return candidate;
    localDate = shiftCalendarDate(localDate, 1);
  }

  throw new Error('Could not calculate the next daily reminder occurrence');
}

function nextWeeklyOccurrence(anchor: LocalDateTime, after: Date, timezone: string): Date {
  const localAfter = dateOnly(zonedDateTimeParts(after, timezone));
  const targetWeekday = weekday(anchor);
  const daysAhead = (targetWeekday - weekday(localAfter) + 7) % 7;
  let candidateDate = shiftCalendarDate(localAfter, daysAhead);
  let candidate = occurrenceOn(candidateDate, anchor, timezone);

  if (candidate.getTime() <= after.getTime()) {
    candidateDate = shiftCalendarDate(candidateDate, 7);
    candidate = occurrenceOn(candidateDate, anchor, timezone);
  }

  return candidate;
}

function nextMonthlyOccurrence(anchor: LocalDateTime, after: Date, timezone: string): Date {
  const localAfter = zonedDateTimeParts(after, timezone);
  let year = localAfter.year;
  let month = localAfter.month;

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = occurrenceOn(
      {
        year,
        month,
        day: Math.min(anchor.day, daysInMonth(year, month)),
      },
      anchor,
      timezone,
    );
    if (candidate.getTime() > after.getTime()) return candidate;

    ({ year, month } = shiftCalendarMonth(year, month));
  }

  throw new Error('Could not calculate the next monthly reminder occurrence');
}

function nextYearlyOccurrence(anchor: LocalDateTime, after: Date, timezone: string): Date {
  const localAfter = zonedDateTimeParts(after, timezone);

  for (let year = localAfter.year; year <= localAfter.year + 4; year += 1) {
    const candidate = occurrenceOn(
      {
        year,
        month: anchor.month,
        day: Math.min(anchor.day, daysInMonth(year, anchor.month)),
      },
      anchor,
      timezone,
    );
    if (candidate.getTime() > after.getTime()) return candidate;
  }

  throw new Error('Could not calculate the next yearly reminder occurrence');
}

function occurrenceOn(
  date: Pick<LocalDateTime, 'year' | 'month' | 'day'>,
  time: Pick<LocalDateTime, 'hour' | 'minute'>,
  timezone: string,
): Date {
  return zonedDateTimeToUtc(
    {
      ...date,
      hour: time.hour,
      minute: time.minute,
    },
    timezone,
  );
}

function dateOnly(value: LocalDateTime): Pick<LocalDateTime, 'year' | 'month' | 'day'> {
  return {
    year: value.year,
    month: value.month,
    day: value.day,
  };
}

function shiftCalendarDate(
  value: Pick<LocalDateTime, 'year' | 'month' | 'day'>,
  days: number,
): Pick<LocalDateTime, 'year' | 'month' | 'day'> {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function shiftCalendarMonth(year: number, month: number): { year: number; month: number } {
  const shifted = new Date(Date.UTC(year, month, 1));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
  };
}

function weekday(value: Pick<LocalDateTime, 'year' | 'month' | 'day'>): number {
  return new Date(Date.UTC(value.year, value.month - 1, value.day)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function zonedDateTimeToUtc(localDateTime: LocalDateTime, timezone: string): Date {
  const desiredWallTime = wallTime(localDateTime);
  let candidate = desiredWallTime;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = zonedDateTimeParts(new Date(candidate), timezone);
    candidate += desiredWallTime - wallTime(parts);
  }

  return new Date(candidate);
}

function zonedDateTimeParts(date: Date, timezone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]),
  );

  return {
    year: values.year as number,
    month: values.month as number,
    day: values.day as number,
    hour: values.hour as number,
    minute: values.minute as number,
  };
}

function wallTime(value: LocalDateTime): number {
  return Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute);
}
