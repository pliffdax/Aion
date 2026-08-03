import type { Command } from '../../core/commands/command.js';
import { getLocale, translate, type Locale } from '../../core/i18n/i18n.js';
import { renderCommandHelp } from '../help/help.command.js';

export const command: Command = {
  name: 'start',
  descriptionKey: 'command.start.description',
  access: 'user',
  async handle(context, commands) {
    const locale = getLocale(context.from?.id);
    await context.reply(renderWelcome(locale, commands));
  },
};

export function renderWelcome(locale: Locale, commands: readonly Command[]): string {
  return [translate(locale, 'start.greeting'), '', renderCommandHelp(locale, commands)].join('\n');
}
