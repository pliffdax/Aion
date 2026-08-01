import type { Command } from '../../core/commands/command.js';
import { getLocale, translate } from '../../core/i18n/i18n.js';

export const command: Command = {
  name: 'ping',
  descriptionKey: 'command.ping.description',
  access: 'user',
  async handle(context) {
    await context.reply(translate(getLocale(context.from?.id), 'ping.response'));
  },
};
