import type { v1 } from '@aion/contracts';
import type { TranslationKey } from '../../core/i18n/i18n.js';
import type {
  DailyReportDraft,
  ReportCalendar,
  ReportItem,
  ReportItemStatus,
  WeeklyReportDraft,
} from './report.formatter.js';

export type DailyReportSection = v1.TelegramDailyReportSection;
export type WeeklyReportSection = v1.TelegramWeeklyReportSection;
export type ConfiguredReportStep = DailyReportSection | WeeklyReportSection;
export type ReportType = 'daily' | 'weekly';
export type ReportStep = 'choose' | ConfiguredReportStep;

export interface ReportConfiguration {
  dailySections: DailyReportSection[];
  weeklySections: WeeklyReportSection[];
}

export interface MessageReference {
  chatId: number;
  messageId: number;
}

export interface ReportSession {
  userId: number;
  authorName: string;
  authorTag: string;
  startDate: string;
  type: ReportType | null;
  step: ReportStep;
  collector: MessageReference;
  calendar: ReportCalendar;
  configuration: ReportConfiguration;
  editingItemId: number | null;
  nextItemId: number;
  daily: DailyReportDraft;
  weekly: WeeklyReportDraft;
}

export function createReportSession(
  userId: number,
  authorName: string,
  authorTag: string,
  startDate: string,
  collector: MessageReference,
  calendar: ReportCalendar,
  configuration: ReportConfiguration,
): ReportSession {
  return {
    userId,
    authorName,
    authorTag,
    startDate,
    type: null,
    step: 'choose',
    collector,
    calendar,
    configuration: {
      dailySections: [...configuration.dailySections],
      weeklySections: [...configuration.weeklySections],
    },
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

export function setReportType(session: ReportSession, type: ReportType): void {
  session.type = type;
  session.step = sectionsForType(session, type)[0];
  session.editingItemId = null;
}

export function sectionsForType(session: ReportSession, type: ReportType): ConfiguredReportStep[] {
  return type === 'daily'
    ? session.configuration.dailySections
    : session.configuration.weeklySections;
}

export function advanceReportStep(session: ReportSession): boolean {
  if (!session.type || session.step === 'choose') return false;

  const sections = sectionsForType(session, session.type);
  const currentIndex = sections.indexOf(session.step);
  const nextStep = sections[currentIndex + 1];
  if (!nextStep) return false;

  session.editingItemId = null;
  session.step = nextStep;
  return true;
}

export function retreatReportStep(session: ReportSession): void {
  if (!session.type || session.step === 'choose') return;

  const sections = sectionsForType(session, session.type);
  const currentIndex = sections.indexOf(session.step);
  session.editingItemId = null;

  if (currentIndex <= 0) {
    session.step = 'choose';
    session.type = null;
    return;
  }

  session.step = sections[currentIndex - 1];
}

export function reportStepPosition(session: ReportSession): { current: number; total: number } {
  if (!session.type || session.step === 'choose') return { current: 0, total: 0 };

  const sections = sectionsForType(session, session.type);
  return {
    current: sections.indexOf(session.step) + 1,
    total: sections.length,
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

export function stepTitleKey(step: ConfiguredReportStep): TranslationKey {
  const keys: Record<ConfiguredReportStep, TranslationKey> = {
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
