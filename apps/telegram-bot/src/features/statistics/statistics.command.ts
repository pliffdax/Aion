import { Bot, type CallbackQueryContext, type Context } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import type { Command } from '../../core/commands/command.js';
import { getLocale } from '../../core/i18n/i18n.js';
import { currentKyivDateKey } from '../../core/time/kyiv-calendar.js';
import {
  buildWeeklyStatisticsKeyboard,
  latestCompletedWeekStart,
  renderWeeklyStatistics,
} from './weekly-statistics.js';

const weekCallbackPattern = /^statistics:week:(\d{4}-\d{2}-\d{2})$/;
let registeredApiClient: AionApiClient | null = null;

export const command: Command = {
  name: 'stats',
  descriptionKey: 'command.stats.description',
  access: 'user',
  async handle(context) {
    const userId = context.from?.id;
    if (!userId) throw new Error('Telegram user ID is required for statistics');

    const periodStart = latestCompletedWeekStart(currentKyivDateKey());
    const statistics = await requireApiClient().getWeeklyPlanStatistics(userId, periodStart);
    await context.reply(renderWeeklyStatistics(statistics), {
      parse_mode: 'HTML',
      reply_markup: buildWeeklyStatisticsKeyboard(statistics.locale, periodStart, periodStart),
    });
  },
};

export function registerStatisticsHandlers(bot: Bot, apiClient: AionApiClient): void {
  registeredApiClient = apiClient;

  bot.callbackQuery(weekCallbackPattern, async context => {
    await showWeek(context, apiClient);
  });
}

async function showWeek(
  context: CallbackQueryContext<Context>,
  apiClient: AionApiClient,
): Promise<void> {
  const userId = context.from.id;
  const periodStart = context.match[1];
  const latestPeriodStart = latestCompletedWeekStart(currentKyivDateKey());

  if (periodStart > latestPeriodStart) {
    await context.answerCallbackQuery();
    return;
  }

  const statistics = await apiClient.getWeeklyPlanStatistics(userId, periodStart);
  await context.answerCallbackQuery();
  await context.editMessageText(renderWeeklyStatistics(statistics), {
    parse_mode: 'HTML',
    reply_markup: buildWeeklyStatisticsKeyboard(getLocale(userId), periodStart, latestPeriodStart),
  });
}

function requireApiClient(): AionApiClient {
  if (!registeredApiClient) throw new Error('Statistics API client is not registered');
  return registeredApiClient;
}
