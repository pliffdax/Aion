import type { v1 } from '@aion/contracts';
import type { Api as TelegramApi } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import { escapeHtml } from '../../core/formatting/html.js';
import { translate } from '../../core/i18n/i18n.js';
import { logError, logInfo, logWarn } from '../../core/logging/logger.js';
import { formatReminderDate } from './reminder-date.js';

const pollIntervalMs = 15_000;
const deliveryBatchSize = 10;

export interface ReminderDeliveryWorker {
  stop(): Promise<void>;
}

export function startReminderDelivery(
  telegramApi: TelegramApi,
  apiClient: AionApiClient,
): ReminderDeliveryWorker {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let currentRun: Promise<void> = Promise.resolve();

  const schedule = (delayMs: number) => {
    timer = setTimeout(() => {
      currentRun = pollAndSchedule();
    }, delayMs);
  };

  const pollAndSchedule = async (): Promise<void> => {
    let nextDelay = pollIntervalMs;

    try {
      const claimedCount = await deliverDueReminders(telegramApi, apiClient);
      nextDelay = claimedCount === deliveryBatchSize ? 0 : pollIntervalMs;
    } catch (error) {
      logError('telegram.reminder.poll_failed', {
        errorMessage: errorMessage(error),
      });
    } finally {
      if (!stopped) schedule(nextDelay);
    }
  };

  currentRun = pollAndSchedule();

  return {
    async stop() {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      await currentRun;
    },
  };
}

async function deliverDueReminders(
  telegramApi: TelegramApi,
  apiClient: AionApiClient,
): Promise<number> {
  const reminders = await apiClient.claimDueReminders(deliveryBatchSize);

  for (const reminder of reminders) {
    await deliverReminder(telegramApi, apiClient, reminder);
  }

  return reminders.length;
}

async function deliverReminder(
  telegramApi: TelegramApi,
  apiClient: AionApiClient,
  reminder: v1.ClaimedTelegramReminderDto,
): Promise<void> {
  try {
    const chatId = safeTelegramChatId(reminder.chatId);
    const date = formatReminderDate(reminder.remindAt, reminder.locale, reminder.timezone);
    const message = [
      `<b>${translate(reminder.locale, 'reminder.notificationTitle')}</b>`,
      '',
      escapeHtml(reminder.text),
      '',
      `<i>${translate(reminder.locale, 'reminder.notificationScheduled', { date })}</i>`,
    ].join('\n');

    await telegramApi.sendMessage(chatId, message, { parse_mode: 'HTML' });
    await apiClient.completeReminderDelivery(reminder.id, reminder.deliveryToken);
    logInfo('telegram.reminder.delivered', {
      reminderId: reminder.id,
      telegramUserId: reminder.telegramUserId,
      chatId: reminder.chatId,
      deliveryNumber: reminder.sentCount + 1,
      repeatType: reminder.recurrence.type,
    });
  } catch (error) {
    const message = errorMessage(error).slice(0, 500);

    await apiClient
      .failReminderDelivery(reminder.id, reminder.deliveryToken, message)
      .catch(reportError => {
        logError('telegram.reminder.failure_report_failed', {
          reminderId: reminder.id,
          errorMessage: errorMessage(reportError),
        });
      });
    logWarn('telegram.reminder.delivery_failed', {
      reminderId: reminder.id,
      telegramUserId: reminder.telegramUserId,
      chatId: reminder.chatId,
      errorMessage: message,
    });
  }
}

function safeTelegramChatId(value: string): number {
  const chatId = Number(value);

  if (!Number.isSafeInteger(chatId) || chatId <= 0) {
    throw new Error(`Unsupported Telegram chat ID: ${value}`);
  }

  return chatId;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
