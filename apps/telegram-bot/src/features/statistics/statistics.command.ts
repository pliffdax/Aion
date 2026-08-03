import { Bot, InlineKeyboard, type CallbackQueryContext, type Context } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import type { Command } from '../../core/commands/command.js';
import { getLocale, translate, type Locale, type TranslationKey } from '../../core/i18n/i18n.js';
import {
  claimTextInput,
  ownsTextInput,
  releaseTextInput,
} from '../../core/interactions/text-input-owner.js';
import { currentKyivDateKey } from '../../core/time/kyiv-calendar.js';
import {
  buildWeeklyStatisticsKeyboard,
  formatStatisticsDateInput,
  latestCompletedWeekStart,
  parseStatisticsDateInput,
  renderWeeklyStatistics,
  weekStartContainingDate,
} from './weekly-statistics.js';

const weekCallbackPattern = /^statistics:week:(\d{4}-\d{2}-\d{2})$/;
const dateCallbackPattern = /^statistics:date:(\d{4}-\d{2}-\d{2})$/;
interface StatisticsDateSession {
  userId: number;
  chatId: number;
  messageId: number;
  previousPeriodStart: string;
}

const dateSessions = new Map<number, StatisticsDateSession>();
let registeredApiClient: AionApiClient | null = null;

export const command: Command = {
  name: 'stats',
  descriptionKey: 'command.stats.description',
  access: 'user',
  async handle(context) {
    const userId = context.from?.id;
    if (!userId) throw new Error('Telegram user ID is required for statistics');

    dateSessions.delete(userId);
    releaseTextInput(userId, 'statistics');

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

  bot.callbackQuery(dateCallbackPattern, async context => {
    const message = context.callbackQuery.message;
    if (!message) return;

    const userId = context.from.id;
    const session = {
      userId,
      chatId: message.chat.id,
      messageId: message.message_id,
      previousPeriodStart: context.match[1],
    };
    dateSessions.set(userId, session);
    claimTextInput(userId, 'statistics');
    await context.answerCallbackQuery();
    await context.editMessageText(renderDatePrompt(getLocale(userId), session), {
      parse_mode: 'HTML',
      reply_markup: buildDatePromptKeyboard(getLocale(userId)),
    });
  });

  bot.callbackQuery('statistics:date:cancel', async context => {
    const session = activeDateSession(context);
    if (!session) return;

    await context.answerCallbackQuery();
    await restoreWeek(context, apiClient, session);
  });

  bot.on('message:text', async (context, next) => {
    const session = dateSessions.get(context.from.id);

    if (
      !session ||
      !ownsTextInput(context.from.id, 'statistics') ||
      context.chat.id !== session.chatId ||
      context.message.text.startsWith('/')
    ) {
      await next();
      return;
    }

    const selectedDate = parseStatisticsDateInput(context.message.text);
    const latestPeriodStart = latestCompletedWeekStart(currentKyivDateKey());
    const periodStart = selectedDate ? weekStartContainingDate(selectedDate) : null;

    if (!periodStart || periodStart > latestPeriodStart) {
      const errorKey = periodStart ? 'statistics.incompleteWeek' : 'statistics.invalidDate';
      await context.deleteMessage().catch(() => undefined);
      await context.api.editMessageText(
        session.chatId,
        session.messageId,
        renderDatePrompt(getLocale(session.userId), session, errorKey),
        {
          parse_mode: 'HTML',
          reply_markup: buildDatePromptKeyboard(getLocale(session.userId)),
        },
      );
      return;
    }

    const statistics = await apiClient.getWeeklyPlanStatistics(session.userId, periodStart);
    await context.deleteMessage().catch(() => undefined);
    clearDateSession(session.userId);
    await context.api.editMessageText(
      session.chatId,
      session.messageId,
      renderWeeklyStatistics(statistics),
      {
        parse_mode: 'HTML',
        reply_markup: buildWeeklyStatisticsKeyboard(
          statistics.locale,
          periodStart,
          latestPeriodStart,
        ),
      },
    );
  });
}

function activeDateSession(context: CallbackQueryContext<Context>): StatisticsDateSession | null {
  const session = dateSessions.get(context.from.id);
  const message = context.callbackQuery.message;
  return session && message?.message_id === session.messageId ? session : null;
}

async function restoreWeek(
  context: CallbackQueryContext<Context>,
  apiClient: AionApiClient,
  session: StatisticsDateSession,
): Promise<void> {
  const latestPeriodStart = latestCompletedWeekStart(currentKyivDateKey());
  const statistics = await apiClient.getWeeklyPlanStatistics(
    session.userId,
    session.previousPeriodStart,
  );
  clearDateSession(session.userId);
  await context.editMessageText(renderWeeklyStatistics(statistics), {
    parse_mode: 'HTML',
    reply_markup: buildWeeklyStatisticsKeyboard(
      statistics.locale,
      session.previousPeriodStart,
      latestPeriodStart,
    ),
  });
}

function renderDatePrompt(
  locale: Locale,
  session: StatisticsDateSession,
  errorKey?: TranslationKey,
): string {
  const prompt = translate(locale, 'statistics.datePrompt', {
    example: formatStatisticsDateInput(session.previousPeriodStart),
  });
  return errorKey ? `${translate(locale, errorKey)}\n\n${prompt}` : prompt;
}

function buildDatePromptKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard().text(
    translate(locale, 'statistics.cancelDate'),
    'statistics:date:cancel',
  );
}

function clearDateSession(userId: number): void {
  dateSessions.delete(userId);
  releaseTextInput(userId, 'statistics');
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
