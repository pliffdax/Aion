const maxAuthorNameLength = 100;
const namePartPattern = /^\p{L}+(?:[-'’]\p{L}+)*$/u;
const dottedDatePattern = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function normalizeReportAuthorName(input: string): string | null {
  const normalized = input.trim().replace(/\s+/g, ' ');
  const parts = normalized.split(' ');

  if (normalized.length > maxAuthorNameLength || parts.length < 2 || parts.length > 6) {
    return null;
  }

  return parts.every(part => namePartPattern.test(part)) ? normalized : null;
}

export function buildReportAuthorTag(authorName: string): string {
  const hashtagBody = authorName.normalize('NFKC').replace(/[^\p{L}\p{N}_]/gu, '');
  return `#${hashtagBody}`;
}

export function parseReportStartDate(input: string, today: string): string | null {
  const value = input.trim();
  const dottedMatch = dottedDatePattern.exec(value);
  const isoMatch = isoDatePattern.exec(value);
  const parts = dottedMatch
    ? { day: Number(dottedMatch[1]), month: Number(dottedMatch[2]), year: Number(dottedMatch[3]) }
    : isoMatch
      ? { day: Number(isoMatch[3]), month: Number(isoMatch[2]), year: Number(isoMatch[1]) }
      : null;

  if (!parts || parts.year < 1970) return null;

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const isValid =
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day;

  if (!isValid) return null;

  const dateKey = date.toISOString().slice(0, 10);
  return dateKey <= today ? dateKey : null;
}
