export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function zonedDateTimeToUtc(localDateTime: LocalDateTime, timezone: string): Date {
  const desiredWallTime = wallTime(localDateTime);
  let candidate = desiredWallTime;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = zonedDateTimeParts(new Date(candidate), timezone);
    candidate += desiredWallTime - wallTime(parts);
  }

  return new Date(candidate);
}

export function matchesZonedDateTime(
  date: Date,
  expected: LocalDateTime,
  timezone: string,
): boolean {
  const actual = zonedDateTimeParts(date, timezone);
  const keys = Object.keys(expected) as Array<keyof LocalDateTime>;
  return keys.every(key => actual[key] === expected[key]);
}

export function zonedDateTimeParts(date: Date, timezone: string): LocalDateTime {
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
