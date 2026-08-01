import type { TranslationKey } from '../../core/i18n/i18n.js';
import type {
  DailyReportDraft,
  ReportCalendar,
  ReportItem,
  ReportItemStatus,
  WeeklyReportDraft,
} from './report.formatter.js';

export type ReportType = 'daily' | 'weekly';
export type ReportStep =
  | 'choose'
  | 'daily-priorities'
  | 'daily-event'
  | 'daily-conclusion'
  | 'daily-tomorrow'
  | 'daily-rating'
  | 'weekly-wins'
  | 'weekly-failure'
  | 'weekly-insight'
  | 'weekly-next'
  | 'weekly-review';

export interface MessageReference {
  chatId: number;
  messageId: number;
}

export interface ReportSession {
  ownerId: number;
  type: ReportType | null;
  step: ReportStep;
  collector: MessageReference;
  calendar: ReportCalendar;
  editingItemId: number | null;
  nextItemId: number;
  daily: DailyReportDraft;
  weekly: WeeklyReportDraft;
}

export function createReportSession(
  ownerId: number,
  collector: MessageReference,
  calendar: ReportCalendar,
): ReportSession {
  return {
    ownerId,
    type: null,
    step: 'choose',
    collector,
    calendar,
    editingItemId: null,
    nextItemId: 1,
    daily: {
      priorities: [],
      event: '',
      conclusion: '',
      tomorrow: [],
      rating: null,
    },
    weekly: {
      wins: [],
      failure: '',
      insight: '',
      nextWeek: [],
      requestReview: null,
    },
  };
}

export function currentItems(session: ReportSession): ReportItem[] | null {
  const lists: Partial<Record<ReportStep, ReportItem[]>> = {
    'daily-priorities': session.daily.priorities,
    'daily-tomorrow': session.daily.tomorrow,
    'weekly-wins': session.weekly.wins,
    'weekly-next': session.weekly.nextWeek,
  };

  return lists[session.step] ?? null;
}

export function currentText(session: ReportSession): string | null {
  const values: Partial<Record<ReportStep, string>> = {
    'daily-event': session.daily.event,
    'daily-conclusion': session.daily.conclusion,
    'weekly-failure': session.weekly.failure,
    'weekly-insight': session.weekly.insight,
  };

  return values[session.step] ?? null;
}

export function setCurrentText(session: ReportSession, value: string): void {
  const setters: Partial<Record<ReportStep, () => void>> = {
    'daily-event': () => {
      session.daily.event = value;
    },
    'daily-conclusion': () => {
      session.daily.conclusion = value;
    },
    'weekly-failure': () => {
      session.weekly.failure = value;
    },
    'weekly-insight': () => {
      session.weekly.insight = value;
    },
  };

  setters[session.step]?.();
}

export function advanceFromList(session: ReportSession): void {
  const nextSteps: Partial<Record<ReportStep, ReportStep>> = {
    'daily-priorities': 'daily-event',
    'daily-tomorrow': 'daily-rating',
    'weekly-wins': 'weekly-failure',
    'weekly-next': 'weekly-review',
  };

  session.step = nextSteps[session.step] ?? session.step;
}

export function advanceFromText(session: ReportSession): void {
  const nextSteps: Partial<Record<ReportStep, ReportStep>> = {
    'daily-event': 'daily-conclusion',
    'daily-conclusion': 'daily-tomorrow',
    'weekly-failure': 'weekly-insight',
    'weekly-insight': 'weekly-next',
  };

  session.step = nextSteps[session.step] ?? session.step;
}

export function retreatReportStep(session: ReportSession): void {
  const previousSteps: Partial<Record<ReportStep, ReportStep>> = {
    'daily-priorities': 'choose',
    'daily-event': 'daily-priorities',
    'daily-conclusion': 'daily-event',
    'daily-tomorrow': 'daily-conclusion',
    'daily-rating': 'daily-tomorrow',
    'weekly-wins': 'choose',
    'weekly-failure': 'weekly-wins',
    'weekly-insight': 'weekly-failure',
    'weekly-next': 'weekly-insight',
    'weekly-review': 'weekly-next',
  };

  session.editingItemId = null;
  session.step = previousSteps[session.step] ?? session.step;

  if (session.step === 'choose') {
    session.type = null;
  }
}

export function stepTitleKey(step: Exclude<ReportStep, 'choose'>): TranslationKey {
  const keys: Record<Exclude<ReportStep, 'choose'>, TranslationKey> = {
    'daily-priorities': 'report.dailyPriorities',
    'daily-event': 'report.dailyEvent',
    'daily-conclusion': 'report.dailyConclusion',
    'daily-tomorrow': 'report.dailyTomorrow',
    'daily-rating': 'report.dailyRating',
    'weekly-wins': 'report.weeklyWins',
    'weekly-failure': 'report.weeklyFailure',
    'weekly-insight': 'report.weeklyInsight',
    'weekly-next': 'report.weeklyNextPlan',
    'weekly-review': 'report.weeklyReview',
  };

  return keys[step];
}

export function stepProgress(step: Exclude<ReportStep, 'choose'>): number {
  const steps: Record<Exclude<ReportStep, 'choose'>, number> = {
    'daily-priorities': 1,
    'daily-event': 2,
    'daily-conclusion': 3,
    'daily-tomorrow': 4,
    'daily-rating': 5,
    'weekly-wins': 1,
    'weekly-failure': 2,
    'weekly-insight': 3,
    'weekly-next': 4,
    'weekly-review': 5,
  };

  return steps[step];
}

export function parseItems(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map(normalizeItem)
    .filter((item): item is string => item.length > 0);
}

export function normalizeItem(value: string): string {
  return value.trim().replace(/^(?:(?:[-–•])|(?:\d+[.)]))\s*/, '');
}

export function isListStep(step: ReportStep): boolean {
  return (
    step === 'daily-priorities' ||
    step === 'daily-tomorrow' ||
    step === 'weekly-wins' ||
    step === 'weekly-next'
  );
}

export function isTextStep(step: ReportStep): boolean {
  return (
    step === 'daily-event' ||
    step === 'daily-conclusion' ||
    step === 'weekly-failure' ||
    step === 'weekly-insight'
  );
}

export function nextStatus(status: ReportItemStatus): ReportItemStatus {
  if (status === 'pending') return 'completed';
  if (status === 'completed') return 'failed';
  return 'pending';
}

export function statusMarker(status: ReportItemStatus): string {
  if (status === 'completed') return '✅';
  if (status === 'failed') return '❌';
  return '⬜';
}

export function draftCharacterCount(session: ReportSession): number {
  return (
    session.daily.priorities.reduce(sumItemLength, 0) +
    session.daily.event.length +
    session.daily.conclusion.length +
    session.daily.tomorrow.reduce(sumItemLength, 0) +
    session.weekly.wins.reduce(sumItemLength, 0) +
    session.weekly.failure.length +
    session.weekly.insight.length +
    session.weekly.nextWeek.reduce(sumItemLength, 0)
  );
}

function sumItemLength(total: number, item: ReportItem): number {
  return total + item.text.length;
}
