import type { Command } from '../../core/commands/command.js';
import { getLocale, translate, type Locale } from '../../core/i18n/i18n.js';

export const command: Command = {
  name: 'help',
  descriptionKey: 'command.help.description',
  access: 'user',
  async handle(context, commands) {
    const locale = getLocale(context.from?.id);
    await context.reply(renderCommandHelp(locale, commands));
  },
};

export function renderCommandHelp(locale: Locale, commands: readonly Command[]): string {
  const commandList = commands
    .map(({ name, descriptionKey }) => `/${name} — ${translate(locale, descriptionKey)}`)
    .join('\n');

  return `${translate(locale, 'commands.helpTitle')}\n\n${commandList}`;
}
