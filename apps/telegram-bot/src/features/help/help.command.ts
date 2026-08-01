import type { Command } from '../../core/commands/command.js';
import { getLocale, translate } from '../../core/i18n/i18n.js';

export const command: Command = {
  name: 'help',
  descriptionKey: 'command.help.description',
  access: 'user',
  async handle(context, commands) {
    const locale = getLocale(context.from?.id);
    const commandList = commands
      .map(({ name, descriptionKey }) => `/${name} — ${translate(locale, descriptionKey)}`)
      .join('\n');

    await context.reply(`${translate(locale, 'commands.helpTitle')}\n\n${commandList}`);
  },
};
