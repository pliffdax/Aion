import { InlineKeyboard } from 'grammy';
import { translate, type Locale } from '../i18n/i18n.js';
import { escapeHtml } from './html.js';

const telegramCopyTextLimit = 256;

export function renderCopyableText(value: string): string {
  return `<pre>${escapeHtml(value)}</pre>`;
}

export function addCopyCurrentTextButton(
  keyboard: InlineKeyboard,
  locale: Locale,
  value: string | null | undefined,
): InlineKeyboard {
  if (value && value.length <= telegramCopyTextLimit) {
    keyboard.copyText(translate(locale, 'common.copyCurrentText'), value).row();
  }

  return keyboard;
}
