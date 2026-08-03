import { v1 } from '@aion/contracts';
import { InlineKeyboard } from 'grammy';
import { escapeHtml } from '../../core/formatting/html.js';
import { getLocale, translate, type Locale, type TranslationKey } from '../../core/i18n/i18n.js';
import type { ReportCalendar, ReportItem } from './report.formatter.js';
import {
  currentField,
  currentItems,
  currentText,
  isBooleanStep,
  isListStep,
  isRatingStep,
  isTextStep,
  reportStepPosition,
  statusMarker,
  type ReportField,
  type ReportSession,
  type ReportType,
} from './report.session.js';

export function renderReportMenu(
  locale: Locale,
  authorName: string,
  startDate: string,
  calendar: Pick<ReportCalendar, 'week' | 'day'>,
): string {
  return translate(locale, 'report.menuTitle', {
    author: escapeHtml(authorName),
    date: formatDate(startDate),
    week: calendar.week,
    day: calendar.day,
  });
}

export function buildReportMenuKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard()
    .text(translate(locale, 'report.start'), 'report:menu:start')
    .row()
    .text(translate(locale, 'report.history'), 'report:menu:history')
    .row()
    .text(translate(locale, 'report.settings'), 'report:menu:settings')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:setup:cancel');
}

export function renderReportHistory(
  locale: Locale,
  type: ReportType | null,
  reports: v1.TelegramReportDto[],
): string {
  const filter = type
    ? translate(locale, type === 'daily' ? 'report.daily' : 'report.weekly')
    : translate(locale, 'report.historyAll');
  const hint = reports.length > 0 ? 'report.historyHint' : 'report.historyEmpty';

  return [
    translate(locale, 'report.historyTitle'),
    '',
    translate(locale, 'report.historyFilter', { type: filter }),
    '',
    translate(locale, hint),
  ].join('\n');
}

export function buildReportHistoryKeyboard(
  locale: Locale,
  reports: v1.TelegramReportDto[],
  options: { type: ReportType | null; hasPrevious: boolean; hasNext: boolean },
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(
      `${options.type === null ? '✅ ' : ''}${translate(locale, 'report.historyAll')}`,
      'report:history:filter:all',
    )
    .text(
      `${options.type === 'daily' ? '✅ ' : ''}${translate(locale, 'report.historyDaily')}`,
      'report:history:filter:daily',
    )
    .text(
      `${options.type === 'weekly' ? '✅ ' : ''}${translate(locale, 'report.historyWeekly')}`,
      'report:history:filter:weekly',
    )
    .row();

  for (const report of reports) {
    keyboard.text(reportHistoryLabel(report), `report:history:item:${report.id}`).row();
  }

  if (options.hasPrevious) {
    keyboard.text(translate(locale, 'report.historyPrevious'), 'report:history:previous');
  }
  if (options.hasNext) {
    keyboard.text(translate(locale, 'report.historyNext'), 'report:history:next');
  }
  if (options.hasPrevious || options.hasNext) keyboard.row();

  return keyboard.text(translate(locale, 'report.back'), 'report:history:menu');
}

export function buildReportHistoryItemKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard()
    .text(translate(locale, 'report.back'), 'report:history:list')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:setup:cancel');
}

function reportHistoryLabel(report: v1.TelegramReportDto): string {
  if (report.type === 'daily') return `☀️ ${formatDate(report.periodStart)}`;
  return `📊 ${formatDate(report.periodStart)} — ${formatDate(report.periodEnd)}`;
}

export function renderReportSettings(locale: Locale): string {
  return translate(locale, 'report.settingsTitle');
}

export function buildReportSettingsKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard()
    .text(translate(locale, 'report.editAuthor'), 'report:settings:author')
    .row()
    .text(translate(locale, 'report.editCalendar'), 'report:settings:calendar')
    .row()
    .text(translate(locale, 'report.dailyStructure'), 'report:settings:daily')
    .row()
    .text(translate(locale, 'report.weeklyStructure'), 'report:settings:weekly')
    .row()
    .text(translate(locale, 'report.back'), 'report:settings:back')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:setup:cancel');
}

export function renderReportSectionConfiguration(
  locale: Locale,
  type: ReportType,
  fields: ReportField[],
): string {
  const typeLabel = translate(locale, type === 'daily' ? 'report.daily' : 'report.weekly');
  const fieldLines = fields.map(
    (field, index) =>
      `${index + 1}. <b>${escapeHtml(field.title)}</b> · ${reportFieldTypeLabel(locale, field)}`,
  );

  return [
    translate(locale, 'report.configurationTitle', { type: typeLabel }),
    '',
    translate(locale, 'report.builderHint'),
    '',
    ...fieldLines,
  ].join('\n');
}

export function buildReportSectionConfigurationKeyboard(
  locale: Locale,
  type: ReportType,
  fields: ReportField[],
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const [index, field] of fields.entries()) {
    keyboard
      .text(`${index + 1}. ${field.title}`, `report:config:${type}:edit:${index}`)
      .row()
      .text('⬆️', `report:config:${type}:move:up:${index}`)
      .text('⬇️', `report:config:${type}:move:down:${index}`)
      .row();
  }

  return keyboard
    .text(translate(locale, 'report.addField'), `report:config:${type}:add`)
    .row()
    .text(translate(locale, 'report.save'), `report:config:${type}:save`)
    .row()
    .text(translate(locale, 'report.back'), 'report:settings:back')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:setup:cancel');
}

export function renderReportFieldEditor(locale: Locale, field: ReportField): string {
  return [
    translate(locale, 'report.fieldEditorTitle'),
    '',
    `<b>${escapeHtml(field.title)}</b>`,
    `${translate(locale, 'report.fieldType')}: ${reportFieldTypeLabel(locale, field)}`,
    `${translate(locale, 'report.fieldRequired')}: ${translate(locale, field.required ? 'report.yes' : 'report.no')}`,
    '',
    `<i>${field.prompt ? escapeHtml(field.prompt) : translate(locale, 'report.fieldPromptEmpty')}</i>`,
  ].join('\n');
}

export function buildReportFieldEditorKeyboard(locale: Locale, field: ReportField): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(translate(locale, 'report.renameField'), 'report:field:rename')
    .row()
    .text(translate(locale, 'report.editPrompt'), 'report:field:prompt');

  if (field.prompt) {
    keyboard.text(translate(locale, 'report.clearPrompt'), 'report:field:prompt-clear');
  }

  keyboard
    .row()
    .text(typeButton(locale, field, 'text'), 'report:field:type:text')
    .text(typeButton(locale, field, 'list'), 'report:field:type:list')
    .row()
    .text(typeButton(locale, field, 'rating'), 'report:field:type:rating')
    .text(typeButton(locale, field, 'boolean'), 'report:field:type:boolean')
    .row();

  if (field.inputType === 'list') {
    keyboard
      .text(listStyleButton(locale, field, 'dash'), 'report:field:style:dash')
      .text(listStyleButton(locale, field, 'numbered'), 'report:field:style:numbered')
      .row()
      .text(listStyleButton(locale, field, 'status'), 'report:field:style:status')
      .row();
  }

  return keyboard
    .text(
      `${field.required ? '✅' : '⬜'} ${translate(locale, 'report.fieldRequired')}`,
      'report:field:required',
    )
    .row()
    .text(translate(locale, 'report.deleteField'), 'report:field:delete')
    .row()
    .text(translate(locale, 'report.back'), 'report:field:back')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:setup:cancel');
}

export function buildReportFieldTextInputKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard()
    .text(translate(locale, 'report.back'), 'report:field:editor-back')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:setup:cancel');
}

export function renderCollector(session: ReportSession): string {
  const locale = getLocale(session.userId);
  if (!session.type) return translate(locale, 'report.chooseType');

  const field = currentField(session);
  if (!field) return translate(locale, 'report.stale');

  const typeLabel = translate(locale, session.type === 'daily' ? 'report.daily' : 'report.weekly');
  const progress = reportStepPosition(session);
  const lines = [
    `<b>${typeLabel}</b> · <code>${progress.current}/${progress.total}</code>`,
    `<b>${escapeHtml(field.title)}</b>`,
    '',
  ];

  return [...lines, ...renderStepContent(session, field, locale)].join('\n');
}

export function buildCollectorKeyboard(session: ReportSession): InlineKeyboard {
  const locale = getLocale(session.userId);

  if (!session.type) return buildTypeKeyboard(locale);
  if (session.editingItemId !== null) return buildEditingKeyboard(locale);
  if (isListStep(session)) return buildListKeyboard(session, locale);
  if (isTextStep(session)) return buildTextKeyboard(session, locale);
  if (isRatingStep(session)) return buildRatingKeyboard(session, locale);
  if (isBooleanStep(session)) return buildBooleanKeyboard(session, locale);
  return addBackAndCancel(new InlineKeyboard(), locale);
}

export function buildTypeKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard()
    .text(translate(locale, 'report.daily'), 'report:type:daily')
    .text(translate(locale, 'report.weekly'), 'report:type:weekly')
    .row()
    .text(translate(locale, 'report.back'), 'report:menu:back')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:cancel');
}

export function buildReportSetupCancelKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard().text(translate(locale, 'report.cancel'), 'report:setup:cancel');
}

export function buildReportSetupBackAndCancelKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard()
    .text(translate(locale, 'report.back'), 'report:setup:back')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:setup:cancel');
}

export function buildReportStartDateKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard()
    .text(translate(locale, 'report.setupCustomDate'), 'report:setup:date:custom')
    .row()
    .text(translate(locale, 'report.setupWeekDay'), 'report:setup:date:week-day')
    .row()
    .text(translate(locale, 'report.setupToday'), 'report:setup:date:today')
    .row()
    .text(translate(locale, 'report.back'), 'report:setup:back')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:setup:cancel');
}

function renderStepContent(session: ReportSession, field: ReportField, locale: Locale): string[] {
  if (session.editingItemId !== null) return renderEditingItem(session, locale);

  const prompt = field.prompt ? [escapeHtml(field.prompt), ''] : [];
  if (isListStep(session)) return [...prompt, ...renderList(session)];
  if (isTextStep(session)) return [...prompt, ...renderText(session)];
  if (isRatingStep(session)) return [...prompt, translate(locale, 'report.ratingPrompt')];
  return [...prompt, translate(locale, 'report.booleanPrompt')];
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

function renderList(session: ReportSession): string[] {
  const field = currentField(session);
  const showStatus = field?.listStyle === 'status';
  return renderCollectorItems(currentItems(session) ?? [], showStatus);
}

function renderText(session: ReportSession): string[] {
  const value = currentText(session);
  return [value ? escapeHtml(value) : '—'];
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
  const field = currentField(session);
  const supportsStatus = field?.listStyle === 'status';

  for (const [index, item] of items.entries()) {
    addItemButtons(keyboard, item, index, supportsStatus, locale);
  }

  if (items.length > 0 || field?.required === false) {
    keyboard.text(
      translate(locale, items.length > 0 ? 'report.next' : 'report.skip'),
      'report:list-next',
    );
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
  const value = currentText(session);
  const field = currentField(session);

  if (value || field?.required === false) {
    keyboard.text(translate(locale, value ? 'report.next' : 'report.skip'), 'report:text-next');
  }
  if (value) keyboard.text(translate(locale, 'report.clear'), 'report:text-clear');

  return addBackAndCancel(keyboard, locale);
}

function buildRatingKeyboard(session: ReportSession, locale: Locale): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (let rating = 1; rating <= 10; rating += 1) {
    keyboard.text(String(rating), `report:rating:${rating}`);
    if (rating === 5) keyboard.row();
  }

  if (currentField(session)?.required === false) {
    keyboard.row().text(translate(locale, 'report.skip'), 'report:skip');
  }

  return addBackAndCancel(keyboard, locale);
}

function buildBooleanKeyboard(session: ReportSession, locale: Locale): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(translate(locale, 'report.yes'), 'report:boolean:yes')
    .text(translate(locale, 'report.no'), 'report:boolean:no');

  if (currentField(session)?.required === false) {
    keyboard.row().text(translate(locale, 'report.skip'), 'report:skip');
  }

  return addBackAndCancel(keyboard, locale);
}

function addBackAndCancel(keyboard: InlineKeyboard, locale: Locale): InlineKeyboard {
  return keyboard
    .row()
    .text(translate(locale, 'report.back'), 'report:back')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:cancel');
}

function reportFieldTypeLabel(locale: Locale, field: ReportField): string {
  if (field.inputType !== 'list') return translate(locale, fieldTypeKeys[field.inputType]);
  return `${translate(locale, 'report.fieldType.list')} · ${translate(locale, listStyleKeys[field.listStyle ?? 'dash'])}`;
}

function typeButton(
  locale: Locale,
  field: ReportField,
  inputType: v1.TelegramReportFieldInputType,
): string {
  return `${field.inputType === inputType ? '✅' : '⬜'} ${translate(locale, fieldTypeKeys[inputType])}`;
}

function listStyleButton(
  locale: Locale,
  field: ReportField,
  style: v1.TelegramReportListStyle,
): string {
  return `${field.listStyle === style ? '✅' : '⬜'} ${translate(locale, listStyleKeys[style])}`;
}

const fieldTypeKeys: Record<v1.TelegramReportFieldInputType, TranslationKey> = {
  text: 'report.fieldType.text',
  list: 'report.fieldType.list',
  rating: 'report.fieldType.rating',
  boolean: 'report.fieldType.boolean',
};

const listStyleKeys: Record<v1.TelegramReportListStyle, TranslationKey> = {
  dash: 'report.listStyle.dash',
  numbered: 'report.listStyle.numbered',
  status: 'report.listStyle.status',
};

function formatDate(date: string): string {
  return date.split('-').reverse().join('.');
}
