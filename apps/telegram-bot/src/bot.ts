import { Bot, GrammyError, HttpError } from 'grammy';
import type { AionApiClient } from './core/api/aion-api-client.js';
import { loadCommands } from './core/commands/load-commands.js';
import { registerCommands, setUserCommandMenu } from './core/commands/register-commands.js';
import {
  logError,
  logInfo,
  logWarn,
  telegramContextFields,
  telegramUpdateFields,
} from './core/logging/logger.js';
import { getLocale, setLocale, translate } from './core/i18n/i18n.js';
import { registerDailyPlanHandlers } from './features/daily-plan/plan.command.js';
import { registerLanguageHandlers } from './features/language/language.command.js';
import { registerReminderHandlers } from './features/reminder/reminder.command.js';
import { registerReportHandlers } from './features/report/report.command.js';
import { registerWhoamiHandlers } from './features/whoami/whoami.command.js';

export async function createBot(
  token: string,
  ownerId: number,
  allowedUserIds: readonly number[],
  apiClient: AionApiClient,
): Promise<Bot> {
  const bot = new Bot(token);
  const allowedUsers = new Set(allowedUserIds);

  bot.use(async (context, next) => {
    const startedAt = performance.now();

    await next();

    logInfo('telegram.update.handled', {
      ...telegramContextFields(context),
      ...telegramUpdateFields(context),
      durationMs: Math.round(performance.now() - startedAt),
    });
  });

  bot.use(async (context, next) => {
    const userId = context.from?.id;

    if (context.chat?.type !== 'private') {
      logWarn('telegram.access.denied', {
        ...telegramContextFields(context),
        ...telegramUpdateFields(context),
        reason: 'private_chat_required',
      });
      return;
    }

    if (!userId || !allowedUsers.has(userId)) {
      logWarn('telegram.access.denied', {
        ...telegramContextFields(context),
        ...telegramUpdateFields(context),
        reason: 'user_not_allowed',
      });
      const locale = getLocale(userId);
      await context.reply(
        [translate(locale, 'access.closed'), '', translate(locale, 'access.contactAdmin')].join(
          '\n',
        ),
      );
      return;
    }

    await next();
  });

  const commands = await loadCommands();
  const hydratedUsers = new Set<number>();

  bot.use(async (context, next) => {
    const user = context.from;

    if (user && !hydratedUsers.has(user.id)) {
      const persistedUser = await apiClient.upsertTelegramUser({
        id: user.id,
        username: user.username,
        firstName: user.first_name,
      });
      setLocale(user.id, persistedUser.locale);
      await setUserCommandMenu(bot.api, commands, user.id, ownerId, persistedUser.locale);
      hydratedUsers.add(user.id);
    }

    await next();
  });

  await registerCommands(bot, commands, {
    ownerId,
    allowedUserIds,
  });
  registerDailyPlanHandlers(bot, apiClient);
  registerLanguageHandlers(bot, commands, ownerId, apiClient);
  registerReminderHandlers(bot, apiClient);
  registerReportHandlers(bot, ownerId);
  registerWhoamiHandlers(bot, ownerId);

  bot.catch(async error => {
    logError('telegram.update.failed', {
      ...telegramContextFields(error.ctx),
      ...telegramUpdateFields(error.ctx),
      ...telegramErrorFields(error.error),
    });

    await error.ctx
      .reply(translate(getLocale(error.ctx.from?.id), 'error.temporary'))
      .catch(replyError => {
        logError('telegram.error_reply.failed', telegramErrorFields(replyError));
      });
  });

  return bot;
}

function telegramErrorFields(error: unknown): Record<string, unknown> {
  if (error instanceof GrammyError) {
    return {
      errorType: 'telegram_api',
      errorCode: error.error_code,
      errorMessage: error.description,
    };
  }

  if (error instanceof HttpError) {
    return {
      errorType: 'http',
      errorMessage: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      errorType: 'application',
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    };
  }

  return {
    errorType: 'unknown',
    errorMessage: String(error),
  };
}
