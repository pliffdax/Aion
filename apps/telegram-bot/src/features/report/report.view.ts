import { InlineKeyboard } from 'grammy';
import { escapeHtml } from '../../core/formatting/html.js';
import { getLocale, translate, type Locale } from '../../core/i18n/i18n.js';
import type { ReportItem } from './report.formatter.js';
import {
  currentItems,
  currentText,
  isListStep,
  isTextStep,
  statusMarker,
  stepProgress,
  stepTitleKey,
  type ReportSession,
} from './report.session.js';

export function renderCollector(session: ReportSession): string {
  const locale = getLocale(session.ownerId);

  if (session.step === 'choose') {
    return translate(locale, 'report.chooseType');
  }

  const typeLabel = translate(locale, session.type === 'daily' ? 'report.daily' : 'report.weekly');
  const lines = [
    `<b>${typeLabel}</b> · <code>${stepProgress(session.step)}/5</code>`,
    `<b>${translate(locale, stepTitleKey(session.step))}</b>`,
    '',
  ];

  return [...lines, ...renderStepContent(session, locale)].join('\n');
}

export function buildCollectorKeyboard(session: ReportSession): InlineKeyboard {
  const locale = getLocale(session.ownerId);

  if (session.step === 'choose') return buildTypeKeyboard(locale);
  if (session.editingItemId !== null) return buildEditingKeyboard(locale);
  if (isListStep(session.step)) return buildListKeyboard(session, locale);
  if (isTextStep(session.step)) return buildTextKeyboard(session, locale);
  if (session.step === 'daily-rating') return buildRatingKeyboard(locale);
  return buildReviewKeyboard(locale);
}

export function buildTypeKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard()
    .text(translate(locale, 'report.daily'), 'report:type:daily')
    .text(translate(locale, 'report.weekly'), 'report:type:weekly')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:cancel');
}

function renderStepContent(session: ReportSession, locale: Locale): string[] {
  if (session.editingItemId !== null) return renderEditingItem(session, locale);
  if (isListStep(session.step)) return renderList(session, locale);
  if (isTextStep(session.step)) return renderText(session, locale);
  if (session.step === 'daily-rating') return [translate(locale, 'report.ratingPrompt')];
  return [translate(locale, 'report.reviewPrompt')];
}

function renderEditingItem(session: ReportSession, locale: Locale): string[] {
  const items = currentItems(session) ?? [];
  const index = items.findIndex(item => item.id === session.editingItemId);
  const item = items[index];

  return [
    translate(locale, 'report.editingItem', { number: index + 1 }),
    '',
    item ? `<i>${escapeHtml(item.text)}</i>` : '',
  ];
}

function renderList(session: ReportSession, locale: Locale): string[] {
  const isPriorityList = session.step === 'daily-priorities';
  const instructions = [translate(locale, 'report.listHint')];

  if (isPriorityList) {
    instructions.push(translate(locale, 'report.priorityHint'));
  }

  return [
    ...instructions,
    '',
    ...renderCollectorItems(currentItems(session) ?? [], isPriorityList),
  ];
}

function renderText(session: ReportSession, locale: Locale): string[] {
  const value = currentText(session);
  return [translate(locale, 'report.textHint'), '', value ? escapeHtml(value) : '—'];
}

function renderCollectorItems(items: ReportItem[], showStatus: boolean): string[] {
  if (items.length === 0) return ['—'];

  return items.map((item, index) => {
    const marker = showStatus ? `${statusMarker(item.status)} ` : '';
    return `${marker}<b>${index + 1}.</b> ${escapeHtml(item.text)}`;
  });
}

function buildEditingKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard()
    .text(translate(locale, 'report.back'), 'report:edit-cancel')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:cancel');
}

function buildListKeyboard(session: ReportSession, locale: Locale): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const items = currentItems(session) ?? [];
  const supportsStatus = session.step === 'daily-priorities';

  for (const [index, item] of items.entries()) {
    addItemButtons(keyboard, item, index, supportsStatus, locale);
  }

  if (items.length > 0) {
    keyboard.text(translate(locale, 'report.next'), 'report:list-next');
  }

  return addBackAndCancel(keyboard, locale);
}

function addItemButtons(
  keyboard: InlineKeyboard,
  item: ReportItem,
  index: number,
  supportsStatus: boolean,
  locale: Locale,
): void {
  if (supportsStatus) {
    keyboard.text(`${statusMarker(item.status)} ${index + 1}`, `report:item:status:${item.id}`);
  }

  keyboard
    .text(
      translate(locale, 'report.editItem', { number: index + 1 }),
      `report:item:edit:${item.id}`,
    )
    .text(
      translate(locale, 'report.deleteItem', { number: index + 1 }),
      `report:item:delete:${item.id}`,
    )
    .row();
}

function buildTextKeyboard(session: ReportSession, locale: Locale): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (currentText(session)) {
    keyboard.text(translate(locale, 'report.next'), 'report:text-next');
    keyboard.text(translate(locale, 'report.clear'), 'report:text-clear');
  }

  return addBackAndCancel(keyboard, locale);
}

function buildRatingKeyboard(locale: Locale): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (let rating = 1; rating <= 10; rating += 1) {
    keyboard.text(String(rating), `report:rating:${rating}`);
    if (rating === 5) keyboard.row();
  }

  return addBackAndCancel(keyboard, locale);
}

function buildReviewKeyboard(locale: Locale): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(translate(locale, 'report.yes'), 'report:review:yes')
    .text(translate(locale, 'report.no'), 'report:review:no');

  return addBackAndCancel(keyboard, locale);
}

function addBackAndCancel(keyboard: InlineKeyboard, locale: Locale): InlineKeyboard {
  return keyboard
    .row()
    .text(translate(locale, 'report.back'), 'report:back')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:cancel');
}
