import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import type { Command } from '../../core/commands/command.js';
import { getLocale, translate } from '../../core/i18n/i18n.js';

const requestUserId = 1;
const pendingUserRequests = new Set<number>();

export const command: Command = {
  name: 'whoami',
  descriptionKey: 'command.whoami.description',
  access: 'user',
  async handle(context) {
    const locale = getLocale(context.from?.id);

    await context.reply(translate(locale, 'whoami.prompt'), {
      reply_markup: new InlineKeyboard()
        .text(translate(locale, 'whoami.self'), 'whoami:self')
        .text(translate(locale, 'whoami.other'), 'whoami:other'),
    });
  },
};

export function registerWhoamiHandlers(bot: Bot): void {
  bot.callbackQuery('whoami:self', async context => {
    const locale = getLocale(context.from.id);
    await context.answerCallbackQuery();
    await context.editMessageText(
      `${translate(locale, 'whoami.currentUserId')}\n<code>${context.from.id}</code>`,
      {
        parse_mode: 'HTML',
      },
    );
  });

  bot.callbackQuery('whoami:other', async context => {
    const locale = getLocale(context.from.id);
    const chatId = context.chat?.id;

    if (!chatId) {
      await context.answerCallbackQuery(translate(locale, 'whoami.chatUnavailable'));
      return;
    }

    pendingUserRequests.add(chatId);
    await context.answerCallbackQuery();
    await context.editMessageText(translate(locale, 'whoami.selectOther'));
    await context.reply(translate(locale, 'whoami.openSelector'), {
      reply_markup: new Keyboard()
        .requestUsers(translate(locale, 'whoami.selectButton'), requestUserId, {
          user_is_bot: false,
          max_quantity: 1,
          request_username: true,
        })
        .resized()
        .oneTime(),
    });
  });

  bot.on('message:users_shared', async context => {
    if (!pendingUserRequests.delete(context.chat.id)) {
      return;
    }

    const locale = getLocale(context.from.id);
    const sharedUser = context.message.users_shared.users[0];

    if (!sharedUser) {
      await context.reply(translate(locale, 'whoami.userUnavailable'), {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const username = sharedUser.username
      ? `\n${translate(locale, 'whoami.username')} @${sharedUser.username}`
      : '';

    await context.reply(
      `${translate(locale, 'whoami.userId')}\n<code>${sharedUser.user_id}</code>${username}`,
      {
        parse_mode: 'HTML',
        reply_markup: { remove_keyboard: true },
      },
    );
  });
}
