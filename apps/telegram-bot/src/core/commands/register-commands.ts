import { GrammyError, type Api, type Bot } from 'grammy';
import { getLocale, translate, type Locale } from '../i18n/i18n.js';
import { logWarn } from '../logging/logger.js';
import type { Command } from './command.js';

interface CommandRegistrationOptions {
  ownerId: number;
  allowedUserIds: readonly number[];
}

export async function registerCommands(
  bot: Bot,
  commands: readonly Command[],
  options: CommandRegistrationOptions,
): Promise<true> {
  assertUniqueCommandNames(commands);

  for (const command of commands) {
    bot.command(command.name, async context => {
      const isOwner = context.from?.id === options.ownerId;

      if (command.access === 'owner' && !isOwner) {
        await context.reply(translate(getLocale(context.from?.id), 'access.ownerOnly'));
        return;
      }

      await command.handle(context, visibleCommands(commands, isOwner));
    });
  }

  const userCommands = visibleCommands(commands, false);

  await bot.api.setMyCommands(toTelegramCommands(userCommands, 'ru'), {
    scope: { type: 'default' },
  });

  for (const userId of options.allowedUserIds) {
    try {
      await setUserCommandMenu(bot.api, commands, userId, options.ownerId, getLocale(userId));
    } catch (error) {
      if (!isUnknownChatError(error)) throw error;

      logWarn('telegram.command_menu.chat_unavailable', {
        userId,
        reason: 'bot_has_not_seen_chat_yet',
      });
    }
  }

  return true;
}

function assertUniqueCommandNames(commands: readonly Command[]): void {
  const names = commands.map(({ name }) => name);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);

  if (duplicate) {
    throw new Error(`Telegram command /${duplicate} is registered more than once`);
  }
}

function visibleCommands(commands: readonly Command[], isOwner: boolean): Command[] {
  return commands.filter(command => command.access === 'user' || isOwner);
}

export function setUserCommandMenu(
  api: Api,
  commands: readonly Command[],
  userId: number,
  ownerId: number,
  locale: Locale,
): Promise<true> {
  const commandsForUser = visibleCommands(commands, userId === ownerId);

  return api.setMyCommands(toTelegramCommands(commandsForUser, locale), {
    scope: {
      type: 'chat',
      chat_id: userId,
    },
  });
}

function toTelegramCommands(commands: readonly Command[], locale: Locale) {
  return commands.map(({ name, descriptionKey }) => ({
    command: name,
    description: translate(locale, descriptionKey),
  }));
}

function isUnknownChatError(error: unknown): boolean {
  return (
    error instanceof GrammyError &&
    error.error_code === 400 &&
    error.description.toLowerCase().includes('chat not found')
  );
}
