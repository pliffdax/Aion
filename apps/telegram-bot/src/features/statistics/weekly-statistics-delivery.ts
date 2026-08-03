import type { Api as TelegramApi } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import { logError, logInfo, logWarn } from '../../core/logging/logger.js';
import { weeklyStatisticsPeriodEnd, renderWeeklyStatistics } from './weekly-statistics.js';

const batchSize = 10;

export async function deliverWeeklyStatistics(
  telegramApi: TelegramApi,
  apiClient: AionApiClient,
  periodStart: string,
): Promise<boolean> {
  let cursor: string | null = null;
  let hadFailure = false;

  do {
    const page = await apiClient.listWeeklyPlanStatisticsCandidates(periodStart, cursor, batchSize);

    for (const statistics of page.items) {
      const delivered = await deliverUserStatistics(telegramApi, apiClient, statistics);
      hadFailure ||= !delivered;
    }

    cursor = page.nextCursor;
  } while (cursor);

  return !hadFailure;
}

async function deliverUserStatistics(
  telegramApi: TelegramApi,
  apiClient: AionApiClient,
  statistics: Awaited<ReturnType<AionApiClient['getWeeklyPlanStatistics']>>,
): Promise<boolean> {
  const text = renderWeeklyStatistics(statistics);
  const claim = await apiClient.claimReportDelivery(Number(statistics.telegramUserId), {
    type: 'weekly_statistics',
    periodStart: statistics.periodStart,
    periodEnd: weeklyStatisticsPeriodEnd(statistics.periodStart),
    text,
  });

  if (claim.outcome === 'already_sent') return true;

  if (claim.outcome === 'busy') {
    logWarn('telegram.weekly_statistics.delivery_busy', {
      telegramUserId: statistics.telegramUserId,
      periodStart: statistics.periodStart,
    });
    return false;
  }

  try {
    const message = await telegramApi.sendMessage(
      safeTelegramChatId(statistics.telegramUserId),
      text,
      {
        parse_mode: 'HTML',
      },
    );
    await apiClient.completeReportDelivery(claim.reportId, claim.deliveryToken, message.message_id);
    logInfo('telegram.weekly_statistics.delivered', {
      telegramUserId: statistics.telegramUserId,
      periodStart: statistics.periodStart,
    });
    return true;
  } catch (error) {
    const message = errorMessage(error).slice(0, 500);
    await apiClient
      .failReportDelivery(claim.reportId, claim.deliveryToken, message)
      .catch(reportError => {
        logError('telegram.weekly_statistics.failure_report_failed', {
          reportId: claim.reportId,
          errorMessage: errorMessage(reportError),
        });
      });
    logWarn('telegram.weekly_statistics.delivery_failed', {
      telegramUserId: statistics.telegramUserId,
      periodStart: statistics.periodStart,
      errorMessage: message,
    });
    return false;
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
