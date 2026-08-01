import type { Command } from '../../core/commands/command.js';
import { getLocale, translate } from '../../core/i18n/i18n.js';

export const command: Command = {
  name: 'start',
  descriptionKey: 'command.start.description',
  access: 'user',
  async handle(context) {
    await context.reply(translate(getLocale(context.from?.id), 'start.greeting'));
  },
};
