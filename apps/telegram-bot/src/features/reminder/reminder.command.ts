import { v1 } from '@aion/contracts';
import {
  Bot,
  InlineKeyboard,
  type Api as TelegramApi,
  type CallbackQueryContext,
  type Context,
} from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import type { Command } from '../../core/commands/command.js';
import { escapeHtml } from '../../core/formatting/html.js';
import { getLocale, translate } from '../../core/i18n/i18n.js';
import {
  claimTextInput,
  ownsTextInput,
  releaseTextInput,
} from '../../core/interactions/text-input-owner.js';
import {
  formatReminderDate,
  parseReminderDateInput,
  reminderDateExamples,
  reminderTimezone,
} from './reminder-date.js';
import {
  emptyRecurrenceDraft,
  formatReminderRecurrence,
  formatReminderRecurrenceDraft,
  formatReminderRecurrenceProgress,
  toReminderRecurrence,
  type ReminderRecurrenceDraft,
} from './reminder-recurrence.js';

type ReminderStep =
  'menu' | 'text' | 'date' | 'recurrence' | 'interval' | 'limit' | 'confirm' | 'list';

interface ReminderSession {
  userId: number;
  chatId: number;
  collectorMessageId: number;
  step: ReminderStep;
  text: string;
  remindAt: string | null;
  recurrence: ReminderRecurrenceDraft;
  backStep: ReminderStep | null;
}

const maxReminderTextLength = 1000;
const maxVisibleReminders = 15;
const minRepeatIntervalMinutes = 5;
const maxRepeatIntervalMinutes = 43_200;
const minRepeatLimit = 2;
const maxIntervalRepeatLimit = 100;
const maxCalendarRepeatLimit = 1000;
const deleteReminderPattern = /^reminder:delete:([a-z0-9]+)$/;
const repeatTypePattern = /^reminder:repeat:(none|interval|daily|weekly|monthly|yearly)$/;
const repeatIntervalPattern = /^reminder:interval:(5|15|30|60)$/;
const repeatLimitPattern = /^reminder:limit:(3|5|10|unlimited)$/;
const sessions = new Map<number, ReminderSession>();
let registeredApiClient: AionApiClient | null = null;

export const command: Command = {
  name: 'reminder',
  descriptionKey: 'command.reminder.description',
  access: 'user',
  async handle(context) {
    const apiClient = requireApiClient();
    const userId = context.from?.id;
    if (!userId) throw new Error('Telegram user ID is required for reminders');
    const previous = sessions.get(userId);

    if (previous) {
      await context.api
        .deleteMessage(previous.chatId, previous.collectorMessageId)
        .catch(() => undefined);
    }

    releaseTextInput(userId, 'reminder');
    const reminders = await apiClient.listReminders(userId);
    const message = await context.reply(renderMenu(userId, reminders.length), {
      parse_mode: 'HTML',
      reply_markup: menuKeyboard(userId),
    });

    sessions.set(userId, {
      userId,
      chatId: message.chat.id,
      collectorMessageId: message.message_id,
      step: 'menu',
      text: '',
      remindAt: null,
      recurrence: { ...emptyRecurrenceDraft },
      backStep: null,
    });
  },
};

export function registerReminderHandlers(bot: Bot, apiClient: AionApiClient): void {
  registeredApiClient = apiClient;

  bot.callbackQuery('reminder:create', async context => {
    const session = await activeSession(context);
    if (!session) return;

    session.step = 'text';
    session.text = '';
    session.remindAt = null;
    session.recurrence = { ...emptyRecurrenceDraft };
    session.backStep = null;
    claimTextInput(session.userId, 'reminder');
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('reminder:list', async context => {
    const session = await activeSession(context);
    if (!session) return;

    await context.answerCallbackQuery();
    await showReminderList(context.api, session, apiClient);
  });

  bot.callbackQuery('reminder:menu', async context => {
    const session = await activeSession(context);
    if (!session) return;

    await context.answerCallbackQuery();
    await showReminderMenu(context.api, session, apiClient);
  });

  bot.callbackQuery('reminder:back', async context => {
    const session = await activeSession(context);
    if (!session) return;

    const previousStep = session.backStep ?? previousReminderStep(session);
    session.backStep = null;
    await context.answerCallbackQuery();

    if (previousStep === 'menu') {
      session.text = '';
      session.remindAt = null;
      session.recurrence = { ...emptyRecurrenceDraft };
      await showReminderMenu(context.api, session, apiClient);
      return;
    }

    session.step = previousStep;

    if (stepAcceptsText(previousStep)) {
      claimTextInput(session.userId, 'reminder');
    } else {
      releaseTextInput(session.userId, 'reminder');
    }

    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('reminder:edit-text', async context => {
    const session = await activeSession(context);
    if (!session) return;

    session.step = 'text';
    session.backStep = 'confirm';
    claimTextInput(session.userId, 'reminder');
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('reminder:edit-date', async context => {
    const session = await activeSession(context);
    if (!session) return;

    session.step = 'date';
    session.backStep = 'confirm';
    claimTextInput(session.userId, 'reminder');
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('reminder:edit-repeat', async context => {
    const session = await activeSession(context);
    if (!session) return;

    session.step = 'recurrence';
    session.backStep = 'confirm';
    releaseTextInput(session.userId, 'reminder');
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery(repeatTypePattern, async context => {
    const session = await activeSession(context);
    if (!session) return;

    const type = context.match[1] as v1.TelegramReminderRepeatType;
    session.backStep = null;
    session.recurrence = {
      type,
      intervalMinutes: null,
      repeatLimit: null,
    };
    releaseTextInput(session.userId, 'reminder');

    if (type === 'none') {
      session.step = 'confirm';
    } else if (type === 'interval') {
      session.step = 'interval';
      claimTextInput(session.userId, 'reminder');
    } else {
      session.step = 'limit';
      claimTextInput(session.userId, 'reminder');
    }

    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery(repeatIntervalPattern, async context => {
    const session = await activeSession(context);
    if (!session || session.recurrence.type !== 'interval') return;

    session.recurrence.intervalMinutes = Number(context.match[1]);
    session.backStep = null;
    session.step = 'limit';
    claimTextInput(session.userId, 'reminder');
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery(repeatLimitPattern, async context => {
    const session = await activeSession(context);
    if (!session || session.recurrence.type === 'none') return;

    const value = context.match[1];

    if (value === 'unlimited' && session.recurrence.type === 'interval') {
      await context.answerCallbackQuery();
      return;
    }

    session.recurrence.repeatLimit = value === 'unlimited' ? null : Number(value);
    session.backStep = null;
    session.step = 'confirm';
    releaseTextInput(session.userId, 'reminder');
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('reminder:save', async context => {
    const session = await activeSession(context);
    if (!session || session.step !== 'confirm' || !session.remindAt || !session.text) return;

    await context.answerCallbackQuery();
    const reminder = await apiClient.createReminder(
      session.userId,
      session.chatId,
      session.text,
      session.remindAt,
      reminderTimezone,
      toReminderRecurrence(session.recurrence),
    );
    releaseTextInput(session.userId, 'reminder');
    session.step = 'menu';
    session.text = '';
    session.remindAt = null;
    session.recurrence = { ...emptyRecurrenceDraft };
    session.backStep = null;
    await context.editMessageText(renderSavedReminder(session.userId, reminder), {
      parse_mode: 'HTML',
      reply_markup: menuKeyboard(session.userId),
    });
  });

  bot.callbackQuery('reminder:cancel', async context => {
    const session = await activeSession(context);
    if (!session) return;

    sessions.delete(session.userId);
    releaseTextInput(session.userId, 'reminder');
    await context.answerCallbackQuery();
    await context.editMessageText(translate(getLocale(session.userId), 'reminder.cancelled'));
  });

  bot.callbackQuery(deleteReminderPattern, async context => {
    const session = await activeSession(context);
    if (!session) return;

    const reminderId = context.match[1];
    await apiClient.cancelReminder(session.userId, reminderId);
    await context.answerCallbackQuery(translate(getLocale(session.userId), 'reminder.deleted'));
    await showReminderList(context.api, session, apiClient);
  });

  bot.on('message:text', async (context, next) => {
    const session = sessions.get(context.from.id);

    if (
      !session ||
      !ownsTextInput(context.from.id, 'reminder') ||
      context.chat.id !== session.chatId ||
      context.message.text.startsWith('/')
    ) {
      await next();
      return;
    }

    const accepted = await acceptReminderInput(context.api, session, context.message.text);

    if (accepted) {
      await context.deleteMessage().catch(() => undefined);
    }
  });
}

async function acceptReminderInput(
  telegramApi: TelegramApi,
  session: ReminderSession,
  input: string,
): Promise<boolean> {
  if (session.step === 'text') {
    return acceptReminderText(telegramApi, session, input);
  }

  if (session.step === 'date') {
    return acceptReminderDate(telegramApi, session, input);
  }

  if (session.step === 'interval') {
    return acceptRepeatInterval(telegramApi, session, input);
  }

  if (session.step === 'limit') {
    return acceptRepeatLimit(telegramApi, session, input);
  }

  return false;
}

async function acceptReminderText(
  telegramApi: TelegramApi,
  session: ReminderSession,
  input: string,
): Promise<boolean> {
  const locale = getLocale(session.userId);
  const text = input.trim();

  if (!text || text.length > maxReminderTextLength) {
    await telegramApi.sendMessage(
      session.chatId,
      translate(locale, 'reminder.invalidText', { max: maxReminderTextLength }),
    );
    return false;
  }

  session.text = text;
  session.backStep = null;
  session.step = 'date';
  await refreshCollector(telegramApi, session);
  return true;
}

async function acceptReminderDate(
  telegramApi: TelegramApi,
  session: ReminderSession,
  input: string,
): Promise<boolean> {
  const locale = getLocale(session.userId);

  const parsed = parseReminderDateInput(input);

  if (!parsed.ok) {
    const key = parsed.reason === 'past' ? 'reminder.pastDate' : 'reminder.invalidDate';
    await telegramApi.sendMessage(session.chatId, translate(locale, key));
    return false;
  }

  session.remindAt = parsed.remindAt.toISOString();
  session.backStep = null;
  session.recurrence = { ...emptyRecurrenceDraft };
  session.step = 'recurrence';
  releaseTextInput(session.userId, 'reminder');
  await refreshCollector(telegramApi, session);
  return true;
}

async function acceptRepeatInterval(
  telegramApi: TelegramApi,
  session: ReminderSession,
  input: string,
): Promise<boolean> {
  const locale = getLocale(session.userId);
  const intervalMinutes = parseInteger(input);

  if (
    session.recurrence.type !== 'interval' ||
    intervalMinutes === null ||
    intervalMinutes < minRepeatIntervalMinutes ||
    intervalMinutes > maxRepeatIntervalMinutes
  ) {
    await telegramApi.sendMessage(
      session.chatId,
      translate(locale, 'reminder.repeatIntervalInvalid', {
        min: minRepeatIntervalMinutes,
        max: maxRepeatIntervalMinutes,
      }),
    );
    return false;
  }

  session.recurrence.intervalMinutes = intervalMinutes;
  session.backStep = null;
  session.step = 'limit';
  claimTextInput(session.userId, 'reminder');
  await refreshCollector(telegramApi, session);
  return true;
}

async function acceptRepeatLimit(
  telegramApi: TelegramApi,
  session: ReminderSession,
  input: string,
): Promise<boolean> {
  const locale = getLocale(session.userId);
  const repeatLimit = parseInteger(input);
  const max =
    session.recurrence.type === 'interval' ? maxIntervalRepeatLimit : maxCalendarRepeatLimit;

  if (
    session.recurrence.type === 'none' ||
    repeatLimit === null ||
    repeatLimit < minRepeatLimit ||
    repeatLimit > max
  ) {
    await telegramApi.sendMessage(
      session.chatId,
      translate(locale, 'reminder.repeatLimitInvalid', {
        min: minRepeatLimit,
        max,
      }),
    );
    return false;
  }

  session.recurrence.repeatLimit = repeatLimit;
  session.backStep = null;
  session.step = 'confirm';
  releaseTextInput(session.userId, 'reminder');
  await refreshCollector(telegramApi, session);
  return true;
}

async function activeSession(
  context: CallbackQueryContext<Context>,
): Promise<ReminderSession | null> {
  const session = sessions.get(context.from.id);
  const messageId = context.callbackQuery.message?.message_id;

  if (session?.collectorMessageId === messageId) {
    return session ?? null;
  }

  await context.answerCallbackQuery(translate(getLocale(context.from.id), 'reminder.stale'));
  return null;
}

async function showReminderList(
  telegramApi: TelegramApi,
  session: ReminderSession,
  apiClient: AionApiClient,
): Promise<void> {
  const reminders = await apiClient.listReminders(session.userId);
  session.step = 'list';
  releaseTextInput(session.userId, 'reminder');

  await telegramApi.editMessageText(
    session.chatId,
    session.collectorMessageId,
    renderReminderList(session.userId, reminders),
    {
      parse_mode: 'HTML',
      reply_markup: listKeyboard(session.userId, reminders),
    },
  );
}

async function showReminderMenu(
  telegramApi: TelegramApi,
  session: ReminderSession,
  apiClient: AionApiClient,
): Promise<void> {
  const reminders = await apiClient.listReminders(session.userId);
  session.step = 'menu';
  releaseTextInput(session.userId, 'reminder');

  await telegramApi.editMessageText(
    session.chatId,
    session.collectorMessageId,
    renderMenu(session.userId, reminders.length),
    {
      parse_mode: 'HTML',
      reply_markup: menuKeyboard(session.userId),
    },
  );
}

async function refreshCollector(telegramApi: TelegramApi, session: ReminderSession): Promise<void> {
  await telegramApi.editMessageText(
    session.chatId,
    session.collectorMessageId,
    renderCollector(session),
    {
      parse_mode: 'HTML',
      reply_markup: collectorKeyboard(session),
    },
  );
}

function renderCollector(session: ReminderSession): string {
  const locale = getLocale(session.userId);

  if (session.step === 'text') {
    return [
      `<b>${translate(locale, 'reminder.createTitle')}</b>`,
      '',
      translate(locale, 'reminder.textPrompt'),
      session.text ? `\n<i>${escapeHtml(session.text)}</i>` : '',
    ].join('\n');
  }

  if (session.step === 'date') {
    const examples = reminderDateExamples();

    return [
      `<b>${translate(locale, 'reminder.createTitle')}</b>`,
      '',
      `<b>${translate(locale, 'reminder.textLabel')}:</b>`,
      escapeHtml(session.text),
      '',
      translate(locale, 'reminder.datePrompt', {
        dateTimeExample: examples.dateTime,
        dateOnlyExample: examples.dateOnly,
      }),
    ].join('\n');
  }

  if (session.step === 'recurrence') {
    return [
      ...renderReminderDraft(session),
      '',
      `<b>${translate(locale, 'reminder.repeatQuestion')}</b>`,
      translate(locale, 'reminder.repeatQuestionHint'),
    ].join('\n');
  }

  if (session.step === 'interval') {
    return [
      ...renderReminderDraft(session),
      '',
      `<b>${translate(locale, 'reminder.repeatIntervalPrompt')}</b>`,
      translate(locale, 'reminder.repeatIntervalHint', {
        min: minRepeatIntervalMinutes,
        max: maxRepeatIntervalMinutes,
      }),
    ].join('\n');
  }

  if (session.step === 'limit') {
    return [
      ...renderReminderDraft(session),
      '',
      `<b>${translate(locale, 'reminder.repeatLabel')}:</b>`,
      formatReminderRecurrenceDraft(session.recurrence, locale),
      '',
      `<b>${translate(locale, 'reminder.repeatLimitPrompt')}</b>`,
      translate(
        locale,
        session.recurrence.type === 'interval'
          ? 'reminder.repeatLimitIntervalHint'
          : 'reminder.repeatLimitCalendarHint',
      ),
    ].join('\n');
  }

  return renderConfirmation(session);
}

function renderConfirmation(session: ReminderSession): string {
  const locale = getLocale(session.userId);

  return [
    ...renderReminderDraft(session, 'reminder.confirmTitle'),
    '',
    `<b>${translate(locale, 'reminder.repeatLabel')}:</b>`,
    formatReminderRecurrence(toReminderRecurrence(session.recurrence), locale),
  ].join('\n');
}

function renderReminderDraft(
  session: ReminderSession,
  titleKey: 'reminder.createTitle' | 'reminder.confirmTitle' = 'reminder.createTitle',
): string[] {
  const locale = getLocale(session.userId);

  return [
    `<b>${translate(locale, titleKey)}</b>`,
    '',
    `<b>${translate(locale, 'reminder.textLabel')}:</b>`,
    escapeHtml(session.text),
    '',
    `<b>${translate(locale, 'reminder.whenLabel')}:</b>`,
    formatReminderDate(session.remindAt ?? '', locale),
  ];
}

function renderMenu(userId: number, reminderCount: number): string {
  const locale = getLocale(userId);

  return [
    `<b>${translate(locale, 'reminder.menuTitle')}</b>`,
    '',
    translate(locale, 'reminder.menuHint', { count: reminderCount }),
  ].join('\n');
}

function renderReminderList(userId: number, reminders: v1.TelegramReminderListDto): string {
  const locale = getLocale(userId);

  if (reminders.length === 0) {
    return [
      `<b>${translate(locale, 'reminder.listTitle')}</b>`,
      '',
      translate(locale, 'reminder.empty'),
    ].join('\n');
  }

  const visible = reminders.slice(0, maxVisibleReminders);
  const lines = visible.map((reminder, index) => renderReminderListItem(reminder, index, locale));
  const hiddenCount = reminders.length - visible.length;

  if (hiddenCount > 0) {
    lines.push(translate(locale, 'reminder.more', { count: hiddenCount }));
  }

  return [`<b>${translate(locale, 'reminder.listTitle')}</b>`, '', ...lines].join('\n');
}

function renderReminderListItem(
  reminder: v1.TelegramReminderDto,
  index: number,
  locale: ReturnType<typeof getLocale>,
): string {
  const when = formatReminderDate(reminder.remindAt, locale, reminder.timezone);
  const text = escapeHtml(truncateText(reminder.text, 180));
  const recurrence = formatReminderRecurrenceProgress(reminder, locale);
  return [`<b>${index + 1}.</b> ${when} — ${text}`, `<i>${recurrence}</i>`].join('\n');
}

function renderSavedReminder(userId: number, reminder: v1.TelegramReminderDto): string {
  const locale = getLocale(userId);

  return [
    `<b>${translate(locale, 'reminder.saved')}</b>`,
    '',
    escapeHtml(reminder.text),
    '',
    formatReminderDate(reminder.remindAt, locale, reminder.timezone),
    '',
    `<b>${translate(locale, 'reminder.repeatLabel')}:</b>`,
    formatReminderRecurrence(reminder.recurrence, locale),
  ].join('\n');
}

function menuKeyboard(userId: number): InlineKeyboard {
  const locale = getLocale(userId);

  return new InlineKeyboard()
    .text(translate(locale, 'reminder.create'), 'reminder:create')
    .row()
    .text(translate(locale, 'reminder.list'), 'reminder:list')
    .row()
    .text(translate(locale, 'reminder.cancel'), 'reminder:cancel');
}

function collectorKeyboard(session: ReminderSession): InlineKeyboard {
  const locale = getLocale(session.userId);
  const keyboard = new InlineKeyboard();

  if (session.step === 'recurrence') {
    keyboard
      .text(translate(locale, 'reminder.repeatNone'), 'reminder:repeat:none')
      .row()
      .text(translate(locale, 'reminder.repeatInterval'), 'reminder:repeat:interval')
      .row()
      .text(translate(locale, 'reminder.repeatDaily'), 'reminder:repeat:daily')
      .text(translate(locale, 'reminder.repeatWeekly'), 'reminder:repeat:weekly')
      .row()
      .text(translate(locale, 'reminder.repeatMonthly'), 'reminder:repeat:monthly')
      .text(translate(locale, 'reminder.repeatYearly'), 'reminder:repeat:yearly')
      .row();
  }

  if (session.step === 'interval') {
    for (const minutes of [5, 15, 30, 60]) {
      keyboard.text(
        translate(locale, 'reminder.repeatMinutesOption', { minutes }),
        `reminder:interval:${minutes}`,
      );
    }
    keyboard.row();
  }

  if (session.step === 'limit') {
    for (const limit of [3, 5, 10]) {
      keyboard.text(
        translate(locale, 'reminder.repeatCountOption', { count: limit }),
        `reminder:limit:${limit}`,
      );
    }

    if (session.recurrence.type !== 'interval') {
      keyboard
        .row()
        .text(translate(locale, 'reminder.repeatUnlimited'), 'reminder:limit:unlimited');
    }

    keyboard.row();
  }

  if (session.step === 'confirm') {
    keyboard
      .text(translate(locale, 'reminder.save'), 'reminder:save')
      .row()
      .text(translate(locale, 'reminder.editText'), 'reminder:edit-text')
      .text(translate(locale, 'reminder.editDate'), 'reminder:edit-date')
      .row();
    keyboard.text(translate(locale, 'reminder.editRepeat'), 'reminder:edit-repeat').row();
  }

  return keyboard
    .text(translate(locale, 'reminder.back'), 'reminder:back')
    .row()
    .text(translate(locale, 'reminder.cancel'), 'reminder:cancel');
}

function previousReminderStep(session: ReminderSession): ReminderStep {
  switch (session.step) {
    case 'text':
      return 'menu';
    case 'date':
      return 'text';
    case 'recurrence':
      return 'date';
    case 'interval':
      return 'recurrence';
    case 'limit':
      return session.recurrence.type === 'interval' ? 'interval' : 'recurrence';
    case 'confirm':
      return session.recurrence.type === 'none' ? 'recurrence' : 'limit';
    default:
      return 'menu';
  }
}

function stepAcceptsText(step: ReminderStep): boolean {
  return step === 'text' || step === 'date' || step === 'interval' || step === 'limit';
}

function listKeyboard(userId: number, reminders: v1.TelegramReminderListDto): InlineKeyboard {
  const locale = getLocale(userId);
  const keyboard = new InlineKeyboard();

  for (const [index, reminder] of reminders.slice(0, maxVisibleReminders).entries()) {
    keyboard
      .text(
        translate(locale, 'reminder.deleteItem', { number: index + 1 }),
        `reminder:delete:${reminder.id}`,
      )
      .row();
  }

  return keyboard
    .text(translate(locale, 'reminder.create'), 'reminder:create')
    .row()
    .text(translate(locale, 'reminder.back'), 'reminder:menu');
}

function truncateText(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function parseInteger(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function requireApiClient(): AionApiClient {
  if (!registeredApiClient) {
    throw new Error('Reminder handlers must be registered before /reminder is used');
  }

  return registeredApiClient;
}
