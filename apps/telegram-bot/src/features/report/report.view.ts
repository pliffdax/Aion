import { InlineKeyboard } from 'grammy';
import { v1 } from '@aion/contracts';
import { escapeHtml } from '../../core/formatting/html.js';
import { getLocale, translate, type Locale } from '../../core/i18n/i18n.js';
import type { ReportCalendar, ReportItem } from './report.formatter.js';
import {
  currentItems,
  currentText,
  isListStep,
  isTextStep,
  reportStepPosition,
  statusMarker,
  stepTitleKey,
  type ConfiguredReportStep,
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
    .text(translate(locale, 'report.settings'), 'report:menu:settings')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:setup:cancel');
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
  activeSections: ConfiguredReportStep[],
): string {
  const typeLabel = translate(locale, type === 'daily' ? 'report.daily' : 'report.weekly');
  const sectionLines = activeSections.map(
    (section, index) => `${index + 1}. ${translate(locale, stepTitleKey(section))}`,
  );

  return [
    translate(locale, 'report.configurationTitle', { type: typeLabel }),
    '',
    translate(locale, 'report.configurationHint'),
    '',
    ...sectionLines,
  ].join('\n');
}

export function buildReportSectionConfigurationKeyboard(
  locale: Locale,
  type: ReportType,
  activeSections: ConfiguredReportStep[],
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const availableSections =
    type === 'daily'
      ? v1.DefaultTelegramDailyReportSections
      : v1.DefaultTelegramWeeklyReportSections;

  for (const section of availableSections) {
    const activeIndex = activeSections.indexOf(section);
    const marker = activeIndex >= 0 ? '✅' : '⬜';
    const position = activeIndex >= 0 ? `${activeIndex + 1}. ` : '';
    keyboard
      .text(
        `${marker} ${position}${translate(locale, stepTitleKey(section))}`,
        `report:config:${type}:toggle:${section}`,
      )
      .row();

    if (activeIndex >= 0) {
      keyboard
        .text('⬆️', `report:config:${type}:up:${section}`)
        .text('⬇️', `report:config:${type}:down:${section}`)
        .row();
    }
  }

  return keyboard
    .text(translate(locale, 'report.save'), `report:config:${type}:save`)
    .row()
    .text(translate(locale, 'report.back'), 'report:settings:back')
    .row()
    .text(translate(locale, 'report.cancel'), 'report:setup:cancel');
}

export function renderCollector(session: ReportSession): string {
  const locale = getLocale(session.userId);

  if (session.step === 'choose') {
    return translate(locale, 'report.chooseType');
  }

  const typeLabel = translate(locale, session.type === 'daily' ? 'report.daily' : 'report.weekly');
  const progress = reportStepPosition(session);
  const lines = [
    `<b>${typeLabel}</b> · <code>${progress.current}/${progress.total}</code>`,
    `<b>${translate(locale, stepTitleKey(session.step))}</b>`,
    '',
  ];

  return [...lines, ...renderStepContent(session, locale)].join('\n');
}

export function buildCollectorKeyboard(session: ReportSession): InlineKeyboard {
  const locale = getLocale(session.userId);

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

function formatDate(date: string): string {
  return date.split('-').reverse().join('.');
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
