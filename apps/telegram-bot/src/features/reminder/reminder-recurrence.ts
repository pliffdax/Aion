import type { v1 } from '@aion/contracts';
import { translate, type Locale } from '../../core/i18n/i18n.js';

export interface ReminderRecurrenceDraft {
  type: v1.TelegramReminderRepeatType;
  intervalMinutes: number | null;
  repeatLimit: number | null;
}

export const emptyRecurrenceDraft: ReminderRecurrenceDraft = {
  type: 'none',
  intervalMinutes: null,
  repeatLimit: null,
};

export function toReminderRecurrence(
  draft: ReminderRecurrenceDraft,
): v1.TelegramReminderRecurrence {
  if (draft.type === 'none') return { type: 'none' };

  if (draft.type === 'interval') {
    if (draft.intervalMinutes === null || draft.repeatLimit === null) {
      throw new Error('Interval reminder recurrence is incomplete');
    }

    return {
      type: 'interval',
      intervalMinutes: draft.intervalMinutes,
      repeatLimit: draft.repeatLimit,
    };
  }

  return {
    type: draft.type,
    repeatLimit: draft.repeatLimit,
  };
}

export function formatReminderRecurrence(
  recurrence: v1.TelegramReminderRecurrence,
  locale: Locale,
): string {
  const schedule = formatSchedule(recurrence, locale);

  if (recurrence.type === 'none') return schedule;

  return recurrence.repeatLimit === null
    ? `${schedule} · ${translate(locale, 'reminder.repeatUnlimitedSummary')}`
    : `${schedule} · ${translate(locale, 'reminder.repeatTotal', {
        count: recurrence.repeatLimit,
      })}`;
}

export function formatReminderRecurrenceDraft(
  draft: ReminderRecurrenceDraft,
  locale: Locale,
): string {
  switch (draft.type) {
    case 'none':
      return translate(locale, 'reminder.repeatNone');
    case 'interval':
      return draft.intervalMinutes === null
        ? translate(locale, 'reminder.repeatInterval')
        : translate(locale, 'reminder.repeatEveryMinutes', {
            minutes: draft.intervalMinutes,
          });
    case 'daily':
      return translate(locale, 'reminder.repeatDaily');
    case 'weekly':
      return translate(locale, 'reminder.repeatWeekly');
    case 'monthly':
      return translate(locale, 'reminder.repeatMonthly');
    case 'yearly':
      return translate(locale, 'reminder.repeatYearly');
  }
}

export function formatReminderRecurrenceProgress(
  reminder: v1.TelegramReminderDto,
  locale: Locale,
): string {
  const schedule = formatSchedule(reminder.recurrence, locale);
  if (reminder.recurrence.type === 'none') return schedule;

  const repeatLimit = reminder.recurrence.repeatLimit;

  return repeatLimit === null
    ? `${schedule} · ${translate(locale, 'reminder.repeatSentUnlimited', {
        count: reminder.sentCount,
      })}`
    : `${schedule} · ${translate(locale, 'reminder.repeatSentFinite', {
        sent: reminder.sentCount,
        total: repeatLimit,
      })}`;
}

function formatSchedule(recurrence: v1.TelegramReminderRecurrence, locale: Locale): string {
  switch (recurrence.type) {
    case 'none':
      return translate(locale, 'reminder.repeatNone');
    case 'interval':
      return translate(locale, 'reminder.repeatEveryMinutes', {
        minutes: recurrence.intervalMinutes,
      });
    case 'daily':
      return translate(locale, 'reminder.repeatDaily');
    case 'weekly':
      return translate(locale, 'reminder.repeatWeekly');
    case 'monthly':
      return translate(locale, 'reminder.repeatMonthly');
    case 'yearly':
      return translate(locale, 'reminder.repeatYearly');
  }
}
