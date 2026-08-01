import type { CommandContext, Context } from 'grammy';
import type { TranslationKey } from '../i18n/i18n.js';

export type CommandAccess = 'user' | 'owner';

export interface Command {
  name: string;
  descriptionKey: TranslationKey;
  access: CommandAccess;
  handle: (context: CommandContext<Context>, commands: readonly Command[]) => Promise<void>;
}
