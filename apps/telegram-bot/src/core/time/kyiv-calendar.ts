import { zonedDateTimeParts, zonedDateTimeToUtc } from './zoned-date-time.js';

export const kyivTimeZone = 'Europe/Kyiv';

export function currentKyivDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: kyivTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function shiftDateKey(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function millisecondsUntilNextKyivMidnight(now = new Date()): number {
  const nextDate = shiftDateKey(currentKyivDateKey(now), 1);
  const [year, month, day] = nextDate.split('-').map(Number);
  const midnight = zonedDateTimeToUtc(
    {
      year,
      month,
      day,
      hour: 0,
      minute: 0,
    },
    kyivTimeZone,
  );

  return Math.max(1_000, midnight.getTime() - now.getTime());
}

export function isKyivMidnightWindow(now = new Date(), durationMinutes = 5): boolean {
  const parts = zonedDateTimeParts(now, kyivTimeZone);
  return parts.hour === 0 && parts.minute < durationMinutes;
}
