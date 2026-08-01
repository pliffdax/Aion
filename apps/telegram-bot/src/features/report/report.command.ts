import { Bot, type Api as TelegramApi } from 'grammy';
import { TELEGRAM_REPORT_AUTHOR_TAG, TELEGRAM_REPORT_START_DATE } from '../../config.js';
import type { Command } from '../../core/commands/command.js';
import { getLocale, translate, type Locale } from '../../core/i18n/i18n.js';
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
import { buildCollectorKeyboard, buildTypeKeyboard, renderCollector } from './report.view.js';

const timeZone = 'Europe/Kyiv';
const maxItems = 20;
const maxItemLength = 160;
const maxTextLength = 800;
const maxDraftCharacters = 3_000;
const itemActionPattern = /^report:item:(status|edit|delete):(\d+)$/;
const ratingPattern = /^report:rating:(10|[1-9])$/;

type ItemAction = 'status' | 'edit' | 'delete';

const sessionsByOwnerId = new Map<number, ReportSession>();

export const command: Command = {
  name: 'report',
  descriptionKey: 'command.report.description',
  access: 'owner',
  async handle(context) {
    const ownerId = requireOwnerId(context.from?.id);
    const previousSession = sessionsByOwnerId.get(ownerId);
    claimTextInput(ownerId, 'report');

    if (previousSession) {
      await context.api
        .deleteMessage(previousSession.collector.chatId, previousSession.collector.messageId)
        .catch(() => undefined);
    }

    const message = await context.reply(translate(getLocale(ownerId), 'report.chooseType'), {
      reply_markup: buildTypeKeyboard(getLocale(ownerId)),
    });

    sessionsByOwnerId.set(
      ownerId,
      createReportSession(
        ownerId,
        {
          chatId: message.chat.id,
          messageId: message.message_id,
        },
        calculateReportCalendar(currentDateKey(), TELEGRAM_REPORT_START_DATE),
      ),
    );
  },
};

export function registerReportHandlers(bot: Bot, ownerId: number): void {
  bot.callbackQuery(/^report:type:(daily|weekly)$/, async context => {
    const session = await activeSession(context, ownerId);
    if (!session) return;

    session.type = context.match[1] as ReportType;
    session.step = session.type === 'daily' ? 'daily-priorities' : 'weekly-wins';
    session.editingItemId = null;

    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:cancel', async context => {
    const session = await activeSession(context, ownerId);
    if (!session) return;

    sessionsByOwnerId.delete(ownerId);
    releaseTextInput(ownerId, 'report');
    await context.answerCallbackQuery();
    await context.editMessageText(translate(getLocale(ownerId), 'report.cancelled'));
  });

  bot.callbackQuery('report:back', async context => {
    const session = await activeSession(context, ownerId);
    if (!session || session.step === 'choose') return;

    retreatReportStep(session);
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:list-next', async context => {
    const session = await activeSession(context, ownerId);
    if (!session) return;

    const items = currentItems(session);

    if (!items || items.length === 0) {
      await context.answerCallbackQuery(translate(getLocale(ownerId), 'report.needItem'));
      return;
    }

    advanceFromList(session);
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery(itemActionPattern, async context => {
    const session = await activeSession(context, ownerId);
    if (!session) return;

    const action = context.match[1] as ItemAction;
    const itemId = Number(context.match[2]);

    if (!applyItemAction(session, action, itemId)) {
      await context.answerCallbackQuery(translate(getLocale(ownerId), 'report.stale'));
      return;
    }

    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:edit-cancel', async context => {
    const session = await activeSession(context, ownerId);
    if (!session) return;

    session.editingItemId = null;
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:text-clear', async context => {
    const session = await activeSession(context, ownerId);
    if (!session) return;

    setCurrentText(session, '');
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:text-next', async context => {
    const session = await activeSession(context, ownerId);
    if (!session) return;

    if (!currentText(session)?.trim()) {
      await context.answerCallbackQuery(translate(getLocale(ownerId), 'report.needText'));
      return;
    }

    advanceFromText(session);
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery(ratingPattern, async context => {
    const session = await activeSession(context, ownerId);
    if (!session || session.step !== 'daily-rating') return;

    session.daily.rating = Number(context.match[1]);
    await context.answerCallbackQuery();
    await finishReport(context.api, session);
  });

  bot.callbackQuery(/^report:review:(yes|no)$/, async context => {
    const session = await activeSession(context, ownerId);
    if (!session || session.step !== 'weekly-review') return;

    session.weekly.requestReview = context.match[1] === 'yes';
    await context.answerCallbackQuery();
    await finishReport(context.api, session);
  });

  bot.on('message:text', async (context, next) => {
    const session = sessionsByOwnerId.get(context.from.id);
    const input = context.message.text;

    if (!acceptsReportText(session, ownerId, context.from.id, context.chat.id, input)) {
      await next();
      return;
    }

    const locale = getLocale(ownerId);
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
  ownerId: number,
  userId: number,
  chatId: number,
  input: string,
): session is ReportSession {
  return Boolean(
    session &&
    userId === ownerId &&
    chatId === session.collector.chatId &&
    ownsTextInput(userId, 'report') &&
    !input.startsWith('/'),
  );
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

async function activeSession(
  context: {
    from: { id: number };
    callbackQuery: { message?: { message_id: number } };
    answerCallbackQuery: (text?: string) => Promise<unknown>;
  },
  ownerId: number,
): Promise<ReportSession | null> {
  const session = sessionsByOwnerId.get(ownerId);
  const messageId = context.callbackQuery.message?.message_id;

  if (context.from.id === ownerId && session?.collector.messageId === messageId) {
    claimTextInput(ownerId, 'report');
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
      ? formatDailyReport(session.daily, session.calendar, TELEGRAM_REPORT_AUTHOR_TAG)
      : formatWeeklyReport(session.weekly, session.calendar, TELEGRAM_REPORT_AUTHOR_TAG);

  await telegramApi.sendMessage(session.collector.chatId, report, {
    parse_mode: 'HTML',
  });

  sessionsByOwnerId.delete(session.ownerId);
  releaseTextInput(session.ownerId, 'report');
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

function requireOwnerId(ownerId: number | undefined): number {
  if (!ownerId) throw new Error('Telegram owner ID is required for a report');
  return ownerId;
}
