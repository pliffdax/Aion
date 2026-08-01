import { createBot } from './bot.js';
import { AionApiClient } from './core/api/aion-api-client.js';
import {
  API_KEY,
  API_URL,
  BOT_TOKEN,
  TELEGRAM_ALLOWED_USER_IDS,
  TELEGRAM_OWNER_ID,
} from './config.js';
import { logInfo } from './core/logging/logger.js';
import { startDailyPlanRollover } from './features/daily-plan/daily-plan-rollover.js';
import { startReminderDelivery } from './features/reminder/reminder-delivery.js';

const apiClient = new AionApiClient(API_URL, API_KEY);
const bot = await createBot(BOT_TOKEN, TELEGRAM_OWNER_ID, TELEGRAM_ALLOWED_USER_IDS, apiClient);
const reminderDelivery = startReminderDelivery(bot.api, apiClient);
const dailyPlanRollover = startDailyPlanRollover(bot.api, apiClient);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logInfo('telegram.bot.stopping', { signal });
  await Promise.all([reminderDelivery.stop(), dailyPlanRollover.stop()]);

  if (bot.isRunning()) {
    await bot.stop();
  }

  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await bot.start({
  onStart: ({ username }) => {
    logInfo('telegram.bot.started', {
      username,
      allowedUserCount: TELEGRAM_ALLOWED_USER_IDS.length,
    });
  },
});
