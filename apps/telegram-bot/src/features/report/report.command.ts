import { Bot, InlineKeyboard, type Api as TelegramApi } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import type { Command } from '../../core/commands/command.js';
import { getLocale, translate, type Locale } from '../../core/i18n/i18n.js';
import {
  buildReportAuthorTag,
  normalizeReportAuthorName,
  parseReportStartDate,
} from './report-profile.js';
import {
  claimTextInput,
  ownsTextInput,
  releaseTextInput,
} from '../../core/interactions/text-input-owner.js';
import {
  calculateReportCalendar,
  formatDailyReport,
  formatWeeklyReport,
  type ReportItem,
} from './report.formatter.js';
import {
  advanceFromList,
  advanceFromText,
  createReportSession,
  currentItems,
  currentText,
  draftCharacterCount,
  isListStep,
  isTextStep,
  nextStatus,
  normalizeItem,
  parseItems,
  retreatReportStep,
  setCurrentText,
  type ReportSession,
  type ReportType,
} from './report.session.js';
import {
  buildCollectorKeyboard,
  buildReportSetupCancelKeyboard,
  buildReportStartDateKeyboard,
  buildTypeKeyboard,
  renderCollector,
} from './report.view.js';

const timeZone = 'Europe/Kyiv';
const maxItems = 20;
const maxItemLength = 160;
const maxTextLength = 800;
const maxDraftCharacters = 3_000;
const itemActionPattern = /^report:item:(status|edit|delete):(\d+)$/;
const ratingPattern = /^report:rating:(10|[1-9])$/;

type ItemAction = 'status' | 'edit' | 'delete';

type ReportSetupStep = 'author-name' | 'date-choice' | 'custom-date';

interface ReportSetupSession {
  userId: number;
  collector: { chatId: number; messageId: number };
  step: ReportSetupStep;
  authorName: string | null;
}

const sessionsByUserId = new Map<number, ReportSession>();
const setupSessionsByUserId = new Map<number, ReportSetupSession>();
let registeredApiClient: AionApiClient | null = null;

export const command: Command = {
  name: 'report',
  descriptionKey: 'command.report.description',
  access: 'user',
  async handle(context) {
    const apiClient = requireApiClient();
    const telegramUser = context.from;
    if (!telegramUser) throw new Error('Telegram user is required for a report');
    const userId = telegramUser.id;
    const previousSession = sessionsByUserId.get(userId);
    const previousSetup = setupSessionsByUserId.get(userId);
    const profile = await apiClient.upsertTelegramUser({
      id: userId,
      username: telegramUser.username,
      firstName: telegramUser.first_name,
    });

    for (const previous of [previousSession, previousSetup]) {
      if (!previous) continue;
      await context.api
        .deleteMessage(previous.collector.chatId, previous.collector.messageId)
        .catch(() => undefined);
    }

    sessionsByUserId.delete(userId);
    setupSessionsByUserId.delete(userId);

    if (!profile.reportAuthorName) {
      claimTextInput(userId, 'report');
      const message = await context.reply(
        translate(getLocale(userId), 'report.setupAuthorPrompt'),
        {
          parse_mode: 'HTML',
          reply_markup: buildReportSetupCancelKeyboard(getLocale(userId)),
        },
      );
      setupSessionsByUserId.set(userId, {
        userId,
        collector: { chatId: message.chat.id, messageId: message.message_id },
        step: 'author-name',
        authorName: null,
      });
      return;
    }

    if (!profile.reportStartDate) {
      releaseTextInput(userId, 'report');
      const message = await context.reply(
        translate(getLocale(userId), 'report.setupStartDatePrompt'),
        {
          parse_mode: 'HTML',
          reply_markup: buildReportStartDateKeyboard(getLocale(userId)),
        },
      );
      setupSessionsByUserId.set(userId, {
        userId,
        collector: { chatId: message.chat.id, messageId: message.message_id },
        step: 'date-choice',
        authorName: profile.reportAuthorName,
      });
      return;
    }

    claimTextInput(userId, 'report');
    const message = await context.reply(translate(getLocale(userId), 'report.chooseType'), {
      reply_markup: buildTypeKeyboard(getLocale(userId)),
    });
    sessionsByUserId.set(
      userId,
      configuredReportSession(userId, profile.reportAuthorName, profile.reportStartDate, {
        chatId: message.chat.id,
        messageId: message.message_id,
      }),
    );
  },
};

export function registerReportHandlers(bot: Bot, apiClient: AionApiClient): void {
  registeredApiClient = apiClient;

  bot.callbackQuery('report:setup:cancel', async context => {
    const setup = await activeSetupSession(context);
    if (!setup) return;

    setupSessionsByUserId.delete(setup.userId);
    releaseTextInput(setup.userId, 'report');
    await context.answerCallbackQuery();
    await context.editMessageText(translate(getLocale(setup.userId), 'report.cancelled'), {
      reply_markup: new InlineKeyboard(),
    });
  });

  bot.callbackQuery('report:setup:date:custom', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'date-choice') return;

    setup.step = 'custom-date';
    claimTextInput(setup.userId, 'report');
    await context.answerCallbackQuery();
    await context.editMessageText(
      translate(getLocale(setup.userId), 'report.setupCustomDatePrompt'),
      {
        parse_mode: 'HTML',
        reply_markup: buildReportSetupCancelKeyboard(getLocale(setup.userId)),
      },
    );
  });

  bot.callbackQuery('report:setup:date:today', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'date-choice' || !setup.authorName) return;

    const today = currentDateKey();
    await context.answerCallbackQuery();
    await apiClient.updateTelegramUserReportProfile(setup.userId, { reportStartDate: today });
    await beginReportInSetupCollector(context.api, setup, today);
  });

  bot.callbackQuery(/^report:type:(daily|weekly)$/, async context => {
    const session = await activeSession(context);
    if (!session) return;

    session.type = context.match[1] as ReportType;
    session.step = session.type === 'daily' ? 'daily-priorities' : 'weekly-wins';
    session.editingItemId = null;

    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:cancel', async context => {
    const session = await activeSession(context);
    if (!session) return;

    sessionsByUserId.delete(session.userId);
    releaseTextInput(session.userId, 'report');
    await context.answerCallbackQuery();
    await context.editMessageText(translate(getLocale(session.userId), 'report.cancelled'), {
      reply_markup: new InlineKeyboard(),
    });
  });

  bot.callbackQuery('report:back', async context => {
    const session = await activeSession(context);
    if (!session || session.step === 'choose') return;

    retreatReportStep(session);
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:list-next', async context => {
    const session = await activeSession(context);
    if (!session) return;

    const items = currentItems(session);

    if (!items || items.length === 0) {
      await context.answerCallbackQuery(translate(getLocale(session.userId), 'report.needItem'));
      return;
    }

    advanceFromList(session);
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery(itemActionPattern, async context => {
    const session = await activeSession(context);
    if (!session) return;

    const action = context.match[1] as ItemAction;
    const itemId = Number(context.match[2]);

    if (!applyItemAction(session, action, itemId)) {
      await context.answerCallbackQuery(translate(getLocale(session.userId), 'report.stale'));
      return;
    }

    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:edit-cancel', async context => {
    const session = await activeSession(context);
    if (!session) return;

    session.editingItemId = null;
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:text-clear', async context => {
    const session = await activeSession(context);
    if (!session) return;

    setCurrentText(session, '');
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:text-next', async context => {
    const session = await activeSession(context);
    if (!session) return;

    if (!currentText(session)?.trim()) {
      await context.answerCallbackQuery(translate(getLocale(session.userId), 'report.needText'));
      return;
    }

    advanceFromText(session);
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery(ratingPattern, async context => {
    const session = await activeSession(context);
    if (!session || session.step !== 'daily-rating') return;

    session.daily.rating = Number(context.match[1]);
    await context.answerCallbackQuery();
    await finishReport(context.api, session);
  });

  bot.callbackQuery(/^report:review:(yes|no)$/, async context => {
    const session = await activeSession(context);
    if (!session || session.step !== 'weekly-review') return;

    session.weekly.requestReview = context.match[1] === 'yes';
    await context.answerCallbackQuery();
    await finishReport(context.api, session);
  });

  bot.on('message:text', async (context, next) => {
    const setup = setupSessionsByUserId.get(context.from.id);
    const input = context.message.text;

    if (acceptsReportSetupText(setup, context.from.id, context.chat.id, input)) {
      const accepted = await processReportSetupInput(
        context.api,
        setup,
        input,
        getLocale(context.from.id),
        apiClient,
      );

      if (accepted) {
        await context.deleteMessage().catch(() => undefined);
      }
      return;
    }

    const session = sessionsByUserId.get(context.from.id);

    if (!acceptsReportText(session, context.from.id, context.chat.id, input)) {
      await next();
      return;
    }

    const locale = getLocale(context.from.id);
    const text = input.trim();

    if (!text) {
      await context.reply(translate(locale, 'daily.emptyItem'));
      return;
    }

    const accepted = await processReportInput(context.api, session, text, locale);

    if (accepted === null) {
      await next();
      return;
    }

    if (accepted) {
      await context.deleteMessage().catch(() => undefined);
    }
  });
}

function applyItemAction(session: ReportSession, action: ItemAction, itemId: number): boolean {
  const items = currentItems(session);
  if (!items) return false;

  const item = items.find(candidate => candidate.id === itemId);
  if (!item) return false;

  const actions: Record<ItemAction, () => boolean> = {
    status: () => togglePriorityStatus(session, item),
    edit: () => startEditingItem(session, itemId),
    delete: () => deleteItem(session, items, itemId),
  };

  return actions[action]();
}

function togglePriorityStatus(session: ReportSession, item: ReportItem): boolean {
  if (session.step !== 'daily-priorities') return false;

  item.status = nextStatus(item.status);
  return true;
}

function startEditingItem(session: ReportSession, itemId: number): boolean {
  session.editingItemId = itemId;
  return true;
}

function deleteItem(session: ReportSession, items: ReportItem[], itemId: number): boolean {
  const index = items.findIndex(item => item.id === itemId);
  items.splice(index, 1);
  session.editingItemId = null;
  return true;
}

function acceptsReportText(
  session: ReportSession | undefined,
  userId: number,
  chatId: number,
  input: string,
): session is ReportSession {
  return Boolean(
    session &&
    session.userId === userId &&
    chatId === session.collector.chatId &&
    ownsTextInput(userId, 'report') &&
    !input.startsWith('/'),
  );
}

function acceptsReportSetupText(
  setup: ReportSetupSession | undefined,
  userId: number,
  chatId: number,
  input: string,
): setup is ReportSetupSession {
  return Boolean(
    setup &&
    setup.userId === userId &&
    setup.collector.chatId === chatId &&
    (setup.step === 'author-name' || setup.step === 'custom-date') &&
    ownsTextInput(userId, 'report') &&
    !input.startsWith('/'),
  );
}

async function processReportSetupInput(
  telegramApi: TelegramApi,
  setup: ReportSetupSession,
  input: string,
  locale: Locale,
  apiClient: AionApiClient,
): Promise<boolean> {
  if (setup.step === 'author-name') {
    const authorName = normalizeReportAuthorName(input);

    if (!authorName) {
      await sendTemporarySetupNotice(
        telegramApi,
        setup,
        translate(locale, 'report.setupAuthorInvalid'),
      );
      return false;
    }

    await apiClient.updateTelegramUserReportProfile(setup.userId, {
      reportAuthorName: authorName,
    });
    setup.authorName = authorName;
    setup.step = 'date-choice';
    releaseTextInput(setup.userId, 'report');
    await telegramApi.editMessageText(
      setup.collector.chatId,
      setup.collector.messageId,
      translate(locale, 'report.setupStartDatePrompt'),
      { parse_mode: 'HTML', reply_markup: buildReportStartDateKeyboard(locale) },
    );
    return true;
  }

  const today = currentDateKey();
  const startDate = parseReportStartDate(input, today);

  if (!startDate) {
    await sendTemporarySetupNotice(
      telegramApi,
      setup,
      translate(locale, 'report.setupDateInvalid'),
    );
    return false;
  }

  await apiClient.updateTelegramUserReportProfile(setup.userId, { reportStartDate: startDate });
  await beginReportInSetupCollector(telegramApi, setup, startDate);
  return true;
}

async function activeSetupSession(context: {
  from: { id: number };
  callbackQuery: { message?: { message_id: number; chat: { id: number } } };
  answerCallbackQuery: (text?: string) => Promise<unknown>;
}): Promise<ReportSetupSession | null> {
  const userId = context.from.id;
  const setup = setupSessionsByUserId.get(userId);
  const messageId = context.callbackQuery.message?.message_id;
  const chatId = context.callbackQuery.message?.chat.id;

  if (
    setup?.userId === userId &&
    setup.collector.chatId === chatId &&
    setup.collector.messageId === messageId
  ) {
    return setup;
  }

  await context.answerCallbackQuery(translate(getLocale(userId), 'report.stale'));
  return null;
}

async function processReportInput(
  telegramApi: TelegramApi,
  session: ReportSession,
  text: string,
  locale: Locale,
): Promise<boolean | null> {
  const processors = [
    {
      matches: session.editingItemId !== null,
      run: () => replaceEditedItem(telegramApi, session, text, locale),
    },
    {
      matches: isListStep(session.step),
      run: () => appendItems(telegramApi, session, text, locale),
    },
    {
      matches: isTextStep(session.step),
      run: () => replaceCurrentText(telegramApi, session, text, locale),
    },
  ];
  const processor = processors.find(candidate => candidate.matches);

  return processor ? processor.run() : null;
}

async function activeSession(context: {
  from: { id: number };
  callbackQuery: { message?: { message_id: number; chat: { id: number } } };
  answerCallbackQuery: (text?: string) => Promise<unknown>;
}): Promise<ReportSession | null> {
  const userId = context.from.id;
  const session = sessionsByUserId.get(userId);
  const messageId = context.callbackQuery.message?.message_id;
  const chatId = context.callbackQuery.message?.chat.id;

  if (
    session?.userId === userId &&
    session.collector.chatId === chatId &&
    session.collector.messageId === messageId
  ) {
    claimTextInput(userId, 'report');
    return session ?? null;
  }

  await context.answerCallbackQuery(translate(getLocale(context.from.id), 'report.stale'));
  return null;
}

async function appendItems(
  telegramApi: TelegramApi,
  session: ReportSession,
  input: string,
  locale: Locale,
): Promise<boolean> {
  const items = currentItems(session);
  if (!items) return false;

  const newItems = parseItems(input);

  if (newItems.length === 0) {
    await sendTemporaryNotice(telegramApi, session, translate(locale, 'daily.emptyItem'));
    return false;
  }

  if (items.length + newItems.length > maxItems) {
    await sendTemporaryNotice(
      telegramApi,
      session,
      translate(locale, 'report.maxItems', { max: maxItems }),
    );
    return false;
  }

  if (newItems.some(item => item.length > maxItemLength)) {
    await sendTemporaryNotice(
      telegramApi,
      session,
      translate(locale, 'report.itemTooLong', { max: maxItemLength }),
    );
    return false;
  }

  if (draftCharacterCount(session) + newItems.join('').length > maxDraftCharacters) {
    await sendTemporaryNotice(telegramApi, session, translate(locale, 'report.tooLong'));
    return false;
  }

  items.push(
    ...newItems.map(text => ({
      id: session.nextItemId++,
      text,
      status: 'pending' as const,
    })),
  );
  await refreshCollector(telegramApi, session);
  return true;
}

async function replaceEditedItem(
  telegramApi: TelegramApi,
  session: ReportSession,
  text: string,
  locale: Locale,
): Promise<boolean> {
  const target = editedItem(session);
  if (!target) return false;

  const normalized = normalizeItem(text);

  if (!normalized || normalized.length > maxItemLength) {
    await sendTemporaryNotice(
      telegramApi,
      session,
      translate(locale, 'report.itemTooLong', { max: maxItemLength }),
    );
    return false;
  }

  const nextLength = draftCharacterCount(session) - target.text.length + normalized.length;

  if (nextLength > maxDraftCharacters) {
    await sendTemporaryNotice(telegramApi, session, translate(locale, 'report.tooLong'));
    return false;
  }

  target.text = normalized;
  session.editingItemId = null;
  await refreshCollector(telegramApi, session);
  return true;
}

function editedItem(session: ReportSession): ReportItem | null {
  const items = currentItems(session);
  if (!items) return null;

  return items.find(candidate => candidate.id === session.editingItemId) ?? null;
}

async function replaceCurrentText(
  telegramApi: TelegramApi,
  session: ReportSession,
  text: string,
  locale: Locale,
): Promise<boolean> {
  if (text.length > maxTextLength) {
    await sendTemporaryNotice(
      telegramApi,
      session,
      translate(locale, 'report.textTooLong', { max: maxTextLength }),
    );
    return false;
  }

  const previousText = currentText(session) ?? '';
  const nextLength = draftCharacterCount(session) - previousText.length + text.length;

  if (nextLength > maxDraftCharacters) {
    await sendTemporaryNotice(telegramApi, session, translate(locale, 'report.tooLong'));
    return false;
  }

  setCurrentText(session, text);
  await refreshCollector(telegramApi, session);
  return true;
}

async function sendTemporaryNotice(
  telegramApi: TelegramApi,
  session: ReportSession,
  text: string,
): Promise<void> {
  const notice = await telegramApi.sendMessage(session.collector.chatId, text);

  setTimeout(() => {
    void telegramApi.deleteMessage(notice.chat.id, notice.message_id).catch(() => undefined);
  }, 4_000);
}

async function sendTemporarySetupNotice(
  telegramApi: TelegramApi,
  setup: ReportSetupSession,
  text: string,
): Promise<void> {
  const notice = await telegramApi.sendMessage(setup.collector.chatId, text);

  setTimeout(() => {
    void telegramApi.deleteMessage(notice.chat.id, notice.message_id).catch(() => undefined);
  }, 4_000);
}

async function beginReportInSetupCollector(
  telegramApi: TelegramApi,
  setup: ReportSetupSession,
  startDate: string,
): Promise<void> {
  if (!setup.authorName) throw new Error('Report author name is required');

  setupSessionsByUserId.delete(setup.userId);
  claimTextInput(setup.userId, 'report');
  const session = configuredReportSession(
    setup.userId,
    setup.authorName,
    startDate,
    setup.collector,
  );
  sessionsByUserId.set(setup.userId, session);
  await telegramApi.editMessageText(
    setup.collector.chatId,
    setup.collector.messageId,
    translate(getLocale(setup.userId), 'report.chooseType'),
    { reply_markup: buildTypeKeyboard(getLocale(setup.userId)) },
  );
}

function configuredReportSession(
  userId: number,
  authorName: string,
  startDate: string,
  collector: { chatId: number; messageId: number },
): ReportSession {
  return createReportSession(
    userId,
    buildReportAuthorTag(authorName),
    collector,
    calculateReportCalendar(currentDateKey(), startDate),
  );
}

async function refreshCollector(telegramApi: TelegramApi, session: ReportSession): Promise<void> {
  await telegramApi.editMessageText(
    session.collector.chatId,
    session.collector.messageId,
    renderCollector(session),
    {
      parse_mode: 'HTML',
      reply_markup: buildCollectorKeyboard(session),
    },
  );
}

async function finishReport(telegramApi: TelegramApi, session: ReportSession): Promise<void> {
  const report =
    session.type === 'daily'
      ? formatDailyReport(session.daily, session.calendar, session.authorTag)
      : formatWeeklyReport(session.weekly, session.calendar, session.authorTag);

  await telegramApi.sendMessage(session.collector.chatId, report, {
    parse_mode: 'HTML',
  });

  sessionsByUserId.delete(session.userId);
  releaseTextInput(session.userId, 'report');
  await telegramApi
    .deleteMessage(session.collector.chatId, session.collector.messageId)
    .catch(() => undefined);
}

function currentDateKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function requireApiClient(): AionApiClient {
  if (!registeredApiClient) throw new Error('Report API client is not registered');
  return registeredApiClient;
}
