import { Bot, InlineKeyboard } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import type { Command } from '../../core/commands/command.js';
import { setUserCommandMenu } from '../../core/commands/register-commands.js';
import { getLocale, isLocale, setLocale, translate, type Locale } from '../../core/i18n/i18n.js';

const languageCallbackPattern = /^language:set:(ru|uk|en)$/;

export const command: Command = {
  name: 'language',
  descriptionKey: 'command.language.description',
  access: 'user',
  async handle(context) {
    const locale = getLocale(context.from?.id);

    await context.reply(translate(locale, 'language.prompt'), {
      reply_markup: languageKeyboard(),
    });
  },
};

export function registerLanguageHandlers(
  bot: Bot,
  commands: readonly Command[],
  ownerId: number,
  apiClient: AionApiClient,
): void {
  bot.callbackQuery(languageCallbackPattern, async context => {
    const selectedLocale = languageCallbackPattern.exec(context.callbackQuery.data)?.[1];

    if (!selectedLocale || !isLocale(selectedLocale)) {
      await context.answerCallbackQuery();
      return;
    }

    await apiClient.updateTelegramUserLocale(context.from.id, selectedLocale);
    await setUserCommandMenu(context.api, commands, context.from.id, ownerId, selectedLocale);
    setLocale(context.from.id, selectedLocale);
    await context.answerCallbackQuery(translate(selectedLocale, 'language.changed'));
    await context.editMessageText(translate(selectedLocale, 'language.changed'));
  });
}

function languageKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(localeLabel('ru'), 'language:set:ru')
    .text(localeLabel('uk'), 'language:set:uk')
    .text(localeLabel('en'), 'language:set:en');
}

function localeLabel(locale: Locale): string {
  return translate(locale, `language.${localeName(locale)}`);
}

function localeName(locale: Locale): 'russian' | 'ukrainian' | 'english' {
  switch (locale) {
    case 'uk':
      return 'ukrainian';
    case 'en':
      return 'english';
    default:
      return 'russian';
  }
}
