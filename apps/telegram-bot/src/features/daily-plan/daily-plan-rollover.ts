import type { v1 } from '@aion/contracts';
import type { Api as TelegramApi } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import { logError, logInfo, logWarn } from '../../core/logging/logger.js';
import {
  currentKyivDateKey,
  isKyivMidnightWindow,
  millisecondsUntilNextKyivMidnight,
  shiftDateKey,
} from '../../core/time/kyiv-calendar.js';
import { renderDailyPlanSummary } from './daily-plan-summary.js';
import { buildPlanKeyboard, renderPlan, setActiveDailyPlanPanel } from './plan.command.js';

const retryDelayMs = 60_000;
const batchSize = 10;

interface RolloverRunResult {
  claimCount: number;
  hadFailure: boolean;
}

export interface DailyPlanRolloverWorker {
  stop(): Promise<void>;
}

export function startDailyPlanRollover(
  telegramApi: TelegramApi,
  apiClient: AionApiClient,
): DailyPlanRolloverWorker {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let currentRun: Promise<void> = Promise.resolve();

  const schedule = (delayMs: number) => {
    timer = setTimeout(() => {
      currentRun = runAndSchedule();
    }, delayMs);
  };

  const runAndSchedule = async (): Promise<void> => {
    let nextDelay: number | null = null;

    try {
      const result = await processCurrentRollover(telegramApi, apiClient);

      if (result.claimCount === batchSize) {
        nextDelay = 0;
      } else if (result.hadFailure || isKyivMidnightWindow()) {
        nextDelay = retryDelayMs;
      }
    } catch (error) {
      nextDelay = retryDelayMs;
      logError('telegram.daily_plan.rollover_poll_failed', {
        errorMessage: errorMessage(error),
      });
    } finally {
      if (!stopped) schedule(nextDelay ?? millisecondsUntilNextKyivMidnight());
    }
  };

  currentRun = runAndSchedule();

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

async function processCurrentRollover(
  telegramApi: TelegramApi,
  apiClient: AionApiClient,
): Promise<RolloverRunResult> {
  const targetDate = currentKyivDateKey();
  const sourceDate = shiftDateKey(targetDate, -1);
  const claims = await apiClient.claimDailyPlanRollovers(sourceDate, targetDate, batchSize);
  let hadFailure = false;

  for (const claim of claims) {
    const delivered = await deliverRollover(telegramApi, apiClient, claim);
    hadFailure ||= !delivered;
  }

  return {
    claimCount: claims.length,
    hadFailure,
  };
}

async function deliverRollover(
  telegramApi: TelegramApi,
  apiClient: AionApiClient,
  claim: v1.ClaimedTelegramDailyPlanRolloverDto,
): Promise<boolean> {
  try {
    const chatId = safeTelegramChatId(claim.sourcePlan.telegramUserId);
    await telegramApi.sendMessage(chatId, renderDailyPlanSummary(claim), {
      parse_mode: 'HTML',
    });
    const panel = await telegramApi.sendMessage(chatId, renderPlan(claim.targetPlan), {
      parse_mode: 'HTML',
      reply_markup: buildPlanKeyboard(claim.targetPlan),
    });
    setActiveDailyPlanPanel(chatId, panel);
    await apiClient.completeDailyPlanRollover(claim.sourcePlan.id, claim.deliveryToken);
    logInfo('telegram.daily_plan.rollover_delivered', {
      telegramUserId: claim.sourcePlan.telegramUserId,
      sourceDate: claim.sourcePlan.date,
      targetDate: claim.targetPlan.date,
      carriedCount: claim.sourcePlan.items.filter(item => !item.completed).length,
    });
    return true;
  } catch (error) {
    const message = errorMessage(error).slice(0, 500);

    await apiClient
      .failDailyPlanRollover(claim.sourcePlan.id, claim.deliveryToken, message)
      .catch(reportError => {
        logError('telegram.daily_plan.rollover_failure_report_failed', {
          sourcePlanId: claim.sourcePlan.id,
          errorMessage: errorMessage(reportError),
        });
      });
    logWarn('telegram.daily_plan.rollover_delivery_failed', {
      telegramUserId: claim.sourcePlan.telegramUserId,
      sourceDate: claim.sourcePlan.date,
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
