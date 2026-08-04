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

export function parseDateKeyInput(input: string): string | null {
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

export function formatDateKeyInput(dateKey: string): string {
  const [year, month, day] = dateKey.split('-');
  return `${day}.${month}.${year}`;
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
