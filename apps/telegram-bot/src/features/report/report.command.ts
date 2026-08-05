import {
  Bot,
  InlineKeyboard,
  type Api as TelegramApi,
  type CallbackQueryContext,
  type Context,
} from 'grammy';
import type { v1 } from '@aion/contracts';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import type { Command } from '../../core/commands/command.js';
import { getLocale, translate, type Locale } from '../../core/i18n/i18n.js';
import {
  buildReportAuthorTag,
  normalizeReportAuthorName,
  parseReportStartDate,
  reportStartDateFromWeekDay,
} from './report-profile.js';
import {
  claimTextInput,
  ownsTextInput,
  releaseTextInput,
} from '../../core/interactions/text-input-owner.js';
import {
  calculateReportCalendar,
  calculateReportPeriod,
  formatDailyReport,
  formatWeeklyReport,
  type ReportItem,
} from './report.formatter.js';
import {
  advanceReportStep,
  copyReportField,
  currentAnswer,
  currentField,
  createReportSession,
  currentItems,
  currentText,
  currentTypeAnswers,
  clearExistingReportSelection,
  draftCharacterCount,
  editExistingReport,
  isBooleanStep,
  isListStep,
  isRatingStep,
  isTextStep,
  nextStatus,
  normalizeItem,
  parseItems,
  retreatReportStep,
  refillExistingReport,
  sectionsForType,
  selectExistingReport,
  setReportType,
  setCurrentText,
  shouldKeepReportCollector,
  type ReportField,
  type ReportFieldInputType,
  type ReportListStyle,
  type ReportSession,
  type ReportType,
} from './report.session.js';
import {
  buildReportMenuKeyboard,
  buildExistingReportKeyboard,
  buildExistingReportOpenKeyboard,
  buildReportHistoryItemKeyboard,
  buildReportHistoryKeyboard,
  buildReportFieldEditorKeyboard,
  buildReportFieldTextInputKeyboard,
  buildReportSectionConfigurationKeyboard,
  buildReportSettingsKeyboard,
  buildCollectorKeyboard,
  buildReportSetupBackAndCancelKeyboard,
  buildReportSetupCancelKeyboard,
  buildReportStartDateKeyboard,
  buildTypeKeyboard,
  renderReportMenu,
  renderExistingReportMenu,
  renderReportHistory,
  renderReportFieldEditor,
  renderReportFieldTextPrompt,
  renderReportSectionConfiguration,
  renderReportSettings,
  renderCollector,
} from './report.view.js';

const timeZone = 'Europe/Kyiv';
const maxItems = 20;
const maxItemLength = 160;
const maxTextLength = 800;
const maxDraftCharacters = 3_000;
const itemActionPattern = /^report:item:(status|edit|delete):(\d+)$/;
const ratingPattern = /^report:rating:(10|[1-9])$/;
const configurationMovePattern = /^report:config:(daily|weekly):move:(up|down):(\d+)$/;
const maxReportFields = 12;

type ItemAction = 'status' | 'edit' | 'delete';

type ReportSetupStep =
  | 'report-menu'
  | 'report-history-list'
  | 'report-history-item'
  | 'settings-menu'
  | 'author-name'
  | 'date-choice'
  | 'custom-date'
  | 'week-day'
  | 'daily-sections'
  | 'weekly-sections'
  | 'field-editor'
  | 'field-title'
  | 'field-prompt';

type ReportSetupFlow = 'onboarding' | 'settings';

interface ReportSetupSession {
  userId: number;
  collector: { chatId: number; messageId: number };
  step: ReportSetupStep;
  flow: ReportSetupFlow;
  authorName: string | null;
  startDate: string | null;
  dailySections: ReportField[];
  weeklySections: ReportField[];
  savedDailySections: ReportField[];
  savedWeeklySections: ReportField[];
  configuringType: ReportType | null;
  editingFieldId: string | null;
  historyType: v1.TelegramReportType | null;
  historyCursorStack: (string | null)[];
  historyPage: v1.TelegramReportHistoryPageDto | null;
  historySelectedReport: v1.TelegramReportDto | null;
}

const sessionsByUserId = new Map<number, ReportSession>();
const setupSessionsByUserId = new Map<number, ReportSetupSession>();
const finishingReportUserIds = new Set<number>();
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

    const baseSetup = {
      userId,
      flow: 'onboarding' as const,
      authorName: profile.reportAuthorName,
      startDate: profile.reportStartDate,
      dailySections: profile.reportDailySections.map(copyReportField),
      weeklySections: profile.reportWeeklySections.map(copyReportField),
      savedDailySections: profile.reportDailySections.map(copyReportField),
      savedWeeklySections: profile.reportWeeklySections.map(copyReportField),
      configuringType: null,
      editingFieldId: null,
      historyType: null,
      historyCursorStack: [null],
      historyPage: null,
      historySelectedReport: null,
    };

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
        collector: { chatId: message.chat.id, messageId: message.message_id },
        step: 'author-name',
        ...baseSetup,
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
        collector: { chatId: message.chat.id, messageId: message.message_id },
        step: 'date-choice',
        ...baseSetup,
      });
      return;
    }

    releaseTextInput(userId, 'report');
    const message = await context.reply(
      renderReportMenu(
        getLocale(userId),
        profile.reportAuthorName,
        profile.reportStartDate,
        calculateReportCalendar(currentDateKey(), profile.reportStartDate),
      ),
      {
        parse_mode: 'HTML',
        reply_markup: buildReportMenuKeyboard(getLocale(userId)),
      },
    );
    setupSessionsByUserId.set(userId, {
      ...baseSetup,
      flow: 'settings',
      collector: { chatId: message.chat.id, messageId: message.message_id },
      step: 'report-menu',
    });
  },
};

export function registerReportHandlers(bot: Bot, apiClient: AionApiClient): void {
  registeredApiClient = apiClient;

  bot.callbackQuery('report:setup:cancel', async context => {
    const setup = await activeSetupSession(context);
    if (!setup) return;

    setupSessionsByUserId.delete(setup.userId);
    releaseTextInput(setup.userId, 'report');
    const message = translate(getLocale(setup.userId), 'report.closed');
    await context.answerCallbackQuery(message);
    await context.deleteMessage().catch(() =>
      context.editMessageText(message, {
        reply_markup: new InlineKeyboard(),
      }),
    );
  });

  bot.callbackQuery('report:menu:start', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'report-menu' || !setup.authorName || !setup.startDate) return;

    setupSessionsByUserId.delete(setup.userId);
    claimTextInput(setup.userId, 'report');
    sessionsByUserId.set(
      setup.userId,
      configuredReportSession(
        setup.userId,
        setup.authorName,
        setup.startDate,
        setup.collector,
        setup.savedDailySections,
        setup.savedWeeklySections,
      ),
    );
    await context.answerCallbackQuery();
    await context.editMessageText(translate(getLocale(setup.userId), 'report.chooseType'), {
      reply_markup: buildTypeKeyboard(getLocale(setup.userId)),
    });
  });

  bot.callbackQuery('report:menu:settings', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'report-menu') return;

    await context.answerCallbackQuery();
    await showReportSettings(context.api, setup);
  });

  bot.callbackQuery('report:menu:history', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'report-menu') return;

    setup.historyType = null;
    setup.historyCursorStack = [null];
    await context.answerCallbackQuery();
    await showReportHistory(context.api, setup, apiClient);
  });

  bot.callbackQuery(
    /^report:history:filter:(all|daily|weekly|weekly_statistics)$/,
    async context => {
      const setup = await activeSetupSession(context);
      if (!setup || setup.step !== 'report-history-list') return;

      const selectedType =
        context.match[1] === 'all' ? null : (context.match[1] as v1.TelegramReportType);
      if (setup.historyType === selectedType && setup.historyCursorStack.length === 1) {
        await context.answerCallbackQuery();
        return;
      }

      setup.historyType = selectedType;
      setup.historyCursorStack = [null];
      await context.answerCallbackQuery();
      await showReportHistory(context.api, setup, apiClient);
    },
  );

  bot.callbackQuery('report:history:next', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'report-history-list' || !setup.historyPage?.nextCursor) return;

    setup.historyCursorStack.push(setup.historyPage.nextCursor);
    await context.answerCallbackQuery();
    await showReportHistory(context.api, setup, apiClient);
  });

  bot.callbackQuery('report:history:previous', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'report-history-list' || setup.historyCursorStack.length <= 1) {
      return;
    }

    setup.historyCursorStack.pop();
    await context.answerCallbackQuery();
    await showReportHistory(context.api, setup, apiClient);
  });

  bot.callbackQuery(/^report:history:item:([a-z0-9]+)$/, async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'report-history-list') return;

    const reportId = context.match[1];
    if (!setup.historyPage?.items.some(report => report.id === reportId)) {
      await context.answerCallbackQuery(translate(getLocale(setup.userId), 'report.stale'));
      return;
    }

    const report = await apiClient.getReportHistoryItem(setup.userId, reportId);
    setup.step = 'report-history-item';
    setup.historySelectedReport = report;
    await context.answerCallbackQuery();
    await context.editMessageText(report.text, {
      parse_mode: 'HTML',
      reply_markup: buildReportHistoryItemKeyboard(getLocale(setup.userId), report.type),
    });
  });

  bot.callbackQuery('report:history:edit', async context => {
    await beginHistoryReportReplacement(context, apiClient, 'edit');
  });

  bot.callbackQuery('report:history:refill', async context => {
    await beginHistoryReportReplacement(context, apiClient, 'refill');
  });

  bot.callbackQuery('report:history:list', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'report-history-item') return;

    await context.answerCallbackQuery();
    await showReportHistory(context.api, setup, apiClient);
  });

  bot.callbackQuery('report:history:menu', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'report-history-list') return;

    await context.answerCallbackQuery();
    await showReportMenu(context.api, setup);
  });

  bot.callbackQuery('report:settings:author', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'settings-menu') return;

    setup.step = 'author-name';
    setup.flow = 'settings';
    claimTextInput(setup.userId, 'report');
    await context.answerCallbackQuery();
    await context.editMessageText(translate(getLocale(setup.userId), 'report.setupAuthorPrompt'), {
      parse_mode: 'HTML',
      reply_markup: buildReportSetupBackAndCancelKeyboard(getLocale(setup.userId)),
    });
  });

  bot.callbackQuery('report:settings:calendar', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'settings-menu') return;

    setup.flow = 'settings';
    await context.answerCallbackQuery();
    await showReportDateChoice(context.api, setup);
  });

  bot.callbackQuery(/^report:settings:(daily|weekly)$/, async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'settings-menu') return;

    const type = context.match[1] as ReportType;
    if (type === 'daily') setup.dailySections = setup.savedDailySections.map(copyReportField);
    else setup.weeklySections = setup.savedWeeklySections.map(copyReportField);
    setup.configuringType = type;
    setup.editingFieldId = null;
    setup.step = type === 'daily' ? 'daily-sections' : 'weekly-sections';
    await context.answerCallbackQuery();
    await showReportSectionConfiguration(context.api, setup, type);
  });

  bot.callbackQuery('report:settings:back', async context => {
    const setup = await activeSetupSession(context);
    if (!setup) return;

    await context.answerCallbackQuery();
    releaseTextInput(setup.userId, 'report');

    if (setup.configuringType === 'daily') {
      setup.dailySections = setup.savedDailySections.map(copyReportField);
    } else if (setup.configuringType === 'weekly') {
      setup.weeklySections = setup.savedWeeklySections.map(copyReportField);
    }

    if (setup.step === 'settings-menu') {
      await showReportMenu(context.api, setup);
      return;
    }

    await showReportSettings(context.api, setup);
  });

  bot.callbackQuery(/^report:config:(daily|weekly):edit:(\d+)$/, async context => {
    const setup = await activeSetupSession(context);
    if (!setup) return;

    const type = context.match[1] as ReportType;
    const expectedStep = type === 'daily' ? 'daily-sections' : 'weekly-sections';
    if (setup.step !== expectedStep || setup.configuringType !== type) return;

    const fields = configuredFields(setup, type);
    const field = fields[Number(context.match[2])];
    if (!field) return;

    setup.editingFieldId = field.id;
    await context.answerCallbackQuery();
    await showReportFieldEditor(context.api, setup);
  });

  bot.callbackQuery(configurationMovePattern, async context => {
    const setup = await activeSetupSession(context);
    if (!setup) return;

    const type = context.match[1] as ReportType;
    const direction = context.match[2] as 'up' | 'down';
    const index = Number(context.match[3]);
    const expectedStep = type === 'daily' ? 'daily-sections' : 'weekly-sections';
    if (setup.step !== expectedStep || setup.configuringType !== type) return;

    const fields = configuredFields(setup, type);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (fields[index] && fields[targetIndex]) {
      [fields[index], fields[targetIndex]] = [fields[targetIndex], fields[index]];
    }

    await context.answerCallbackQuery();
    await showReportSectionConfiguration(context.api, setup, type);
  });

  bot.callbackQuery(/^report:config:(daily|weekly):add$/, async context => {
    const setup = await activeSetupSession(context);
    if (!setup) return;

    const type = context.match[1] as ReportType;
    const expectedStep = type === 'daily' ? 'daily-sections' : 'weekly-sections';
    if (setup.step !== expectedStep || setup.configuringType !== type) return;

    const fields = configuredFields(setup, type);
    if (fields.length >= maxReportFields) {
      await context.answerCallbackQuery(
        translate(getLocale(setup.userId), 'report.maxFields', { max: maxReportFields }),
      );
      return;
    }

    const field: ReportField = {
      id: makeReportFieldId(fields),
      title: translate(getLocale(setup.userId), 'report.newField'),
      prompt: '',
      inputType: 'text',
      listStyle: null,
      required: true,
    };
    fields.push(field);
    setup.editingFieldId = field.id;

    await context.answerCallbackQuery();
    await showReportFieldEditor(context.api, setup);
  });

  bot.callbackQuery(/^report:field:type:(text|list|rating|boolean)$/, async context => {
    const setup = await activeSetupSession(context);
    const field = setup ? editingSetupField(setup) : null;
    if (!setup || !field || setup.step !== 'field-editor') return;

    field.inputType = context.match[1] as ReportFieldInputType;
    field.listStyle = field.inputType === 'list' ? (field.listStyle ?? 'dash') : null;
    await context.answerCallbackQuery();
    await showReportFieldEditor(context.api, setup);
  });

  bot.callbackQuery(/^report:field:style:(dash|numbered|status)$/, async context => {
    const setup = await activeSetupSession(context);
    const field = setup ? editingSetupField(setup) : null;
    if (!setup || !field || setup.step !== 'field-editor' || field.inputType !== 'list') return;

    field.listStyle = context.match[1] as ReportListStyle;
    await context.answerCallbackQuery();
    await showReportFieldEditor(context.api, setup);
  });

  bot.callbackQuery('report:field:required', async context => {
    const setup = await activeSetupSession(context);
    const field = setup ? editingSetupField(setup) : null;
    if (!setup || !field || setup.step !== 'field-editor') return;

    field.required = !field.required;
    await context.answerCallbackQuery();
    await showReportFieldEditor(context.api, setup);
  });

  bot.callbackQuery('report:field:delete', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'field-editor' || !setup.configuringType) return;

    const fields = configuredFields(setup, setup.configuringType);
    if (fields.length === 1) {
      await context.answerCallbackQuery(
        translate(getLocale(setup.userId), 'report.atLeastOneSection'),
      );
      return;
    }

    const index = fields.findIndex(field => field.id === setup.editingFieldId);
    if (index < 0) return;
    fields.splice(index, 1);
    setup.editingFieldId = null;
    const type = setup.configuringType;
    await context.answerCallbackQuery();
    await showReportSectionConfiguration(context.api, setup, type);
  });

  bot.callbackQuery('report:field:rename', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'field-editor' || !editingSetupField(setup)) return;

    await context.answerCallbackQuery();
    await showReportFieldTextPrompt(context.api, setup, 'field-title');
  });

  bot.callbackQuery('report:field:prompt', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'field-editor' || !editingSetupField(setup)) return;

    await context.answerCallbackQuery();
    await showReportFieldTextPrompt(context.api, setup, 'field-prompt');
  });

  bot.callbackQuery('report:field:prompt-clear', async context => {
    const setup = await activeSetupSession(context);
    const field = setup ? editingSetupField(setup) : null;
    if (!setup || !field || setup.step !== 'field-editor') return;

    field.prompt = '';
    await context.answerCallbackQuery();
    await showReportFieldEditor(context.api, setup);
  });

  bot.callbackQuery('report:field:editor-back', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || (setup.step !== 'field-title' && setup.step !== 'field-prompt')) return;

    await context.answerCallbackQuery();
    await showReportFieldEditor(context.api, setup);
  });

  bot.callbackQuery('report:field:back', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'field-editor' || !setup.configuringType) return;

    const type = setup.configuringType;
    setup.editingFieldId = null;
    await context.answerCallbackQuery();
    await showReportSectionConfiguration(context.api, setup, type);
  });

  bot.callbackQuery(/^report:config:(daily|weekly):save$/, async context => {
    const setup = await activeSetupSession(context);
    if (!setup) return;

    const type = context.match[1] as ReportType;
    const expectedStep = type === 'daily' ? 'daily-sections' : 'weekly-sections';
    if (setup.step !== expectedStep) return;

    await apiClient.updateTelegramUserReportProfile(
      setup.userId,
      type === 'daily'
        ? { reportDailySections: setup.dailySections }
        : { reportWeeklySections: setup.weeklySections },
    );
    if (type === 'daily') setup.savedDailySections = setup.dailySections.map(copyReportField);
    else setup.savedWeeklySections = setup.weeklySections.map(copyReportField);
    setup.configuringType = null;
    setup.editingFieldId = null;
    await context.answerCallbackQuery(translate(getLocale(setup.userId), 'report.settingsSaved'));
    await showReportSettings(context.api, setup);
  });

  bot.callbackQuery('report:setup:back', async context => {
    const setup = await activeSetupSession(context);
    if (!setup) return;

    await context.answerCallbackQuery();

    if (setup.step === 'custom-date' || setup.step === 'week-day') {
      await showReportDateChoice(context.api, setup);
      return;
    }

    if (setup.flow === 'settings') {
      await showReportSettings(context.api, setup);
      return;
    }

    if (setup.step === 'author-name') return;

    setup.step = 'author-name';
    claimTextInput(setup.userId, 'report');
    await context.editMessageText(translate(getLocale(setup.userId), 'report.setupAuthorPrompt'), {
      parse_mode: 'HTML',
      reply_markup: buildReportSetupCancelKeyboard(getLocale(setup.userId)),
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
        reply_markup: buildReportSetupBackAndCancelKeyboard(getLocale(setup.userId)),
      },
    );
  });

  bot.callbackQuery('report:setup:date:week-day', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'date-choice') return;

    setup.step = 'week-day';
    claimTextInput(setup.userId, 'report');
    await context.answerCallbackQuery();
    await context.editMessageText(translate(getLocale(setup.userId), 'report.setupWeekDayPrompt'), {
      parse_mode: 'HTML',
      reply_markup: buildReportSetupBackAndCancelKeyboard(getLocale(setup.userId)),
    });
  });

  bot.callbackQuery('report:setup:date:today', async context => {
    const setup = await activeSetupSession(context);
    if (!setup || setup.step !== 'date-choice' || !setup.authorName) return;

    const today = currentDateKey();
    await context.answerCallbackQuery();
    await saveReportStartDate(context.api, setup, today, apiClient);
  });

  bot.callbackQuery(/^report:type:(daily|weekly)$/, async context => {
    const session = await activeSession(context);
    if (!session) return;
    const type = context.match[1] as ReportType;
    const period = calculateReportPeriod(type, session.calendar, session.startDate);
    const existingReport = await apiClient.findEditableReport(session.userId, {
      type,
      ...period,
    });

    await context.answerCallbackQuery();

    if (existingReport) {
      selectExistingReport(session, type, existingReport);
      releaseTextInput(session.userId, 'report');
      await showExistingReportMenu(context.api, session);
      return;
    }

    setReportType(session, type);
    claimTextInput(session.userId, 'report');
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:existing:open', async context => {
    const session = await activeSession(context);
    if (!session?.existingReport || session.replaceMode) return;

    await context.answerCallbackQuery();
    await context.editMessageText(session.existingReport.text, {
      parse_mode: 'HTML',
      reply_markup: buildExistingReportOpenKeyboard(getLocale(session.userId)),
    });
  });

  bot.callbackQuery('report:existing:back', async context => {
    const session = await activeSession(context);
    if (!session?.existingReport || session.replaceMode) return;

    await context.answerCallbackQuery();
    await showExistingReportMenu(context.api, session);
  });

  bot.callbackQuery('report:existing:type-back', async context => {
    const session = await activeSession(context);
    if (!session?.existingReport || session.replaceMode) return;

    clearExistingReportSelection(session);
    releaseTextInput(session.userId, 'report');
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:existing:edit', async context => {
    const session = await activeSession(context);
    if (!session?.existingReport || session.replaceMode) return;

    if (!editExistingReport(session)) {
      await context.answerCallbackQuery({
        text: translate(getLocale(session.userId), 'report.legacyEditUnavailable'),
        show_alert: true,
      });
      return;
    }

    claimTextInput(session.userId, 'report');
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:existing:refill', async context => {
    const session = await activeSession(context);
    if (!session?.existingReport || session.replaceMode || !refillExistingReport(session)) return;

    claimTextInput(session.userId, 'report');
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:menu:back', async context => {
    const session = await activeSession(context);
    if (!session || session.type !== null) return;

    const setup: ReportSetupSession = {
      userId: session.userId,
      collector: session.collector,
      step: 'report-menu',
      flow: 'settings',
      authorName: session.authorName,
      startDate: session.startDate,
      dailySections: session.configuration.dailySections.map(copyReportField),
      weeklySections: session.configuration.weeklySections.map(copyReportField),
      savedDailySections: session.configuration.dailySections.map(copyReportField),
      savedWeeklySections: session.configuration.weeklySections.map(copyReportField),
      configuringType: null,
      editingFieldId: null,
      historyType: null,
      historyCursorStack: [null],
      historyPage: null,
      historySelectedReport: null,
    };
    sessionsByUserId.delete(session.userId);
    setupSessionsByUserId.set(session.userId, setup);
    releaseTextInput(session.userId, 'report');
    await context.answerCallbackQuery();
    await showReportMenu(context.api, setup);
  });

  bot.callbackQuery('report:cancel', async context => {
    const session = await activeSession(context);
    if (!session) return;

    sessionsByUserId.delete(session.userId);
    releaseTextInput(session.userId, 'report');
    const message = translate(getLocale(session.userId), 'report.cancelled');
    await context.answerCallbackQuery(message);
    await context.deleteMessage().catch(() =>
      context.editMessageText(message, {
        reply_markup: new InlineKeyboard(),
      }),
    );
  });

  bot.callbackQuery('report:close', async context => {
    const session = await activeSession(context);
    if (!session || session.replaceMode) return;

    sessionsByUserId.delete(session.userId);
    releaseTextInput(session.userId, 'report');
    const message = translate(getLocale(session.userId), 'report.closed');
    await context.answerCallbackQuery(message);
    await context.deleteMessage().catch(() =>
      context.editMessageText(message, {
        reply_markup: new InlineKeyboard(),
      }),
    );
  });

  bot.callbackQuery('report:back', async context => {
    const session = await activeSession(context);
    if (!session || session.type === null) return;

    if (session.existingReport && session.replaceMode && session.fieldIndex === 0) {
      session.type = session.existingReport.type as ReportType;
      session.fieldIndex = null;
      session.editingItemId = null;
      session.replaceMode = null;
      releaseTextInput(session.userId, 'report');
      await context.answerCallbackQuery();
      await showExistingReportMenu(context.api, session);
      return;
    }

    retreatReportStep(session);
    await context.answerCallbackQuery();
    await refreshCollector(context.api, session);
  });

  bot.callbackQuery('report:list-next', async context => {
    const session = await activeSession(context);
    if (!session) return;

    const items = currentItems(session);

    if (!items || (items.length === 0 && currentField(session)?.required !== false)) {
      await context.answerCallbackQuery(translate(getLocale(session.userId), 'report.needItem'));
      return;
    }

    await context.answerCallbackQuery();
    await advanceOrFinishReport(context.api, session);
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

    if (!currentText(session)?.trim() && currentField(session)?.required !== false) {
      await context.answerCallbackQuery(translate(getLocale(session.userId), 'report.needText'));
      return;
    }

    await context.answerCallbackQuery();
    await advanceOrFinishReport(context.api, session);
  });

  bot.callbackQuery(ratingPattern, async context => {
    const session = await activeSession(context);
    if (!session || !isRatingStep(session)) return;

    const answer = currentAnswer(session);
    if (!answer) return;
    answer.rating = Number(context.match[1]);
    await context.answerCallbackQuery();
    await advanceOrFinishReport(context.api, session);
  });

  bot.callbackQuery(/^report:boolean:(yes|no)$/, async context => {
    const session = await activeSession(context);
    if (!session || !isBooleanStep(session)) return;

    const answer = currentAnswer(session);
    if (!answer) return;
    answer.boolean = context.match[1] === 'yes';
    await context.answerCallbackQuery();
    await advanceOrFinishReport(context.api, session);
  });

  bot.callbackQuery('report:skip', async context => {
    const session = await activeSession(context);
    const field = session ? currentField(session) : null;
    if (
      !session ||
      !field ||
      field.required ||
      (!isRatingStep(session) && !isBooleanStep(session))
    ) {
      return;
    }

    await context.answerCallbackQuery();
    await advanceOrFinishReport(context.api, session);
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
  if (currentField(session)?.listStyle !== 'status') return false;

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
    (setup.step === 'author-name' ||
      setup.step === 'custom-date' ||
      setup.step === 'week-day' ||
      setup.step === 'field-title' ||
      setup.step === 'field-prompt') &&
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
  if (setup.step === 'field-title' || setup.step === 'field-prompt') {
    const field = editingSetupField(setup);
    if (!field) return false;
    const value = input.trim();

    if (setup.step === 'field-title') {
      if (!value || value.length > 80) {
        await sendTemporarySetupNotice(
          telegramApi,
          setup,
          translate(locale, 'report.fieldTitleInvalid'),
        );
        return false;
      }
      field.title = value;
    } else {
      if (value.length > 240) {
        await sendTemporarySetupNotice(
          telegramApi,
          setup,
          translate(locale, 'report.fieldPromptInvalid'),
        );
        return false;
      }
      field.prompt = value;
    }

    await showReportFieldEditor(telegramApi, setup);
    return true;
  }

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

    if (setup.flow === 'onboarding' && !setup.startDate) {
      await showReportDateChoice(telegramApi, setup);
    } else {
      await showReportSettings(telegramApi, setup);
    }
    return true;
  }

  const today = currentDateKey();
  const isWeekDayInput = setup.step === 'week-day';
  const startDate = isWeekDayInput
    ? reportStartDateFromWeekDay(input, today)
    : parseReportStartDate(input, today);

  if (!startDate) {
    await sendTemporarySetupNotice(
      telegramApi,
      setup,
      translate(locale, isWeekDayInput ? 'report.setupWeekDayInvalid' : 'report.setupDateInvalid'),
    );
    return false;
  }

  await saveReportStartDate(telegramApi, setup, startDate, apiClient);
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

async function beginHistoryReportReplacement(
  context: CallbackQueryContext<Context>,
  apiClient: AionApiClient,
  mode: 'edit' | 'refill',
): Promise<void> {
  const setup = await activeSetupSession(context);
  if (!setup || setup.step !== 'report-history-item') return;
  const selected = setup.historySelectedReport;

  if (!selected || selected.type === 'weekly_statistics' || !setup.authorName || !setup.startDate) {
    await context.answerCallbackQuery(translate(getLocale(setup.userId), 'report.stale'));
    return;
  }

  const existing = await apiClient.findEditableReport(setup.userId, {
    type: selected.type,
    periodStart: selected.periodStart,
    periodEnd: selected.periodEnd,
  });
  if (!existing || existing.id !== selected.id) {
    await context.answerCallbackQuery(translate(getLocale(setup.userId), 'report.stale'));
    return;
  }

  const session = configuredReportSession(
    setup.userId,
    setup.authorName,
    setup.startDate,
    setup.collector,
    setup.savedDailySections,
    setup.savedWeeklySections,
  );
  session.calendar = calculateReportCalendar(selected.periodStart, setup.startDate);
  selectExistingReport(session, selected.type, existing);

  const started = mode === 'edit' ? editExistingReport(session) : refillExistingReport(session);
  if (!started) {
    await context.answerCallbackQuery({
      text: translate(getLocale(setup.userId), 'report.legacyEditUnavailable'),
      show_alert: true,
    });
    return;
  }

  setupSessionsByUserId.delete(setup.userId);
  sessionsByUserId.set(setup.userId, session);
  claimTextInput(setup.userId, 'report');
  await context.answerCallbackQuery();
  await refreshCollector(context.api, session);
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
      matches: isListStep(session),
      run: () => appendItems(telegramApi, session, text, locale),
    },
    {
      matches: isTextStep(session),
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
    setup.savedDailySections,
    setup.savedWeeklySections,
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
  dailySections: ReportField[],
  weeklySections: ReportField[],
): ReportSession {
  return createReportSession(
    userId,
    authorName,
    buildReportAuthorTag(authorName),
    startDate,
    collector,
    calculateReportCalendar(currentDateKey(), startDate),
    { dailySections, weeklySections },
  );
}

async function saveReportStartDate(
  telegramApi: TelegramApi,
  setup: ReportSetupSession,
  startDate: string,
  apiClient: AionApiClient,
): Promise<void> {
  await apiClient.updateTelegramUserReportProfile(setup.userId, { reportStartDate: startDate });
  setup.startDate = startDate;

  if (setup.flow === 'onboarding') {
    await beginReportInSetupCollector(telegramApi, setup, startDate);
    return;
  }

  await showReportSettings(telegramApi, setup);
}

async function showReportMenu(telegramApi: TelegramApi, setup: ReportSetupSession): Promise<void> {
  if (!setup.authorName || !setup.startDate) {
    throw new Error('A configured report profile is required for the report menu');
  }

  setup.step = 'report-menu';
  setup.flow = 'settings';
  releaseTextInput(setup.userId, 'report');
  const locale = getLocale(setup.userId);
  await telegramApi.editMessageText(
    setup.collector.chatId,
    setup.collector.messageId,
    renderReportMenu(
      locale,
      setup.authorName,
      setup.startDate,
      calculateReportCalendar(currentDateKey(), setup.startDate),
    ),
    { parse_mode: 'HTML', reply_markup: buildReportMenuKeyboard(locale) },
  );
}

async function showReportHistory(
  telegramApi: TelegramApi,
  setup: ReportSetupSession,
  apiClient: AionApiClient,
): Promise<void> {
  const cursor = setup.historyCursorStack.at(-1) ?? null;
  const page = await apiClient.listReportHistory(setup.userId, {
    limit: 8,
    ...(setup.historyType ? { type: setup.historyType } : {}),
    ...(cursor ? { cursor } : {}),
  });
  setup.step = 'report-history-list';
  setup.historyPage = page;
  setup.historySelectedReport = null;
  releaseTextInput(setup.userId, 'report');
  const locale = getLocale(setup.userId);

  await telegramApi.editMessageText(
    setup.collector.chatId,
    setup.collector.messageId,
    renderReportHistory(locale, setup.historyType, page.items),
    {
      parse_mode: 'HTML',
      reply_markup: buildReportHistoryKeyboard(locale, page.items, {
        type: setup.historyType,
        hasPrevious: setup.historyCursorStack.length > 1,
        hasNext: page.nextCursor !== null,
      }),
    },
  );
}

async function showReportSettings(
  telegramApi: TelegramApi,
  setup: ReportSetupSession,
): Promise<void> {
  setup.step = 'settings-menu';
  setup.flow = 'settings';
  setup.configuringType = null;
  setup.editingFieldId = null;
  releaseTextInput(setup.userId, 'report');
  const locale = getLocale(setup.userId);
  await telegramApi.editMessageText(
    setup.collector.chatId,
    setup.collector.messageId,
    renderReportSettings(locale),
    { parse_mode: 'HTML', reply_markup: buildReportSettingsKeyboard(locale) },
  );
}

async function showReportDateChoice(
  telegramApi: TelegramApi,
  setup: ReportSetupSession,
): Promise<void> {
  setup.step = 'date-choice';
  releaseTextInput(setup.userId, 'report');
  const locale = getLocale(setup.userId);
  await telegramApi.editMessageText(
    setup.collector.chatId,
    setup.collector.messageId,
    translate(locale, 'report.setupStartDatePrompt'),
    { parse_mode: 'HTML', reply_markup: buildReportStartDateKeyboard(locale) },
  );
}

async function showReportSectionConfiguration(
  telegramApi: TelegramApi,
  setup: ReportSetupSession,
  type: ReportType,
): Promise<void> {
  const locale = getLocale(setup.userId);
  const sections = configuredFields(setup, type);
  setup.step = type === 'daily' ? 'daily-sections' : 'weekly-sections';
  setup.configuringType = type;
  releaseTextInput(setup.userId, 'report');
  await telegramApi.editMessageText(
    setup.collector.chatId,
    setup.collector.messageId,
    renderReportSectionConfiguration(locale, type, sections),
    {
      parse_mode: 'HTML',
      reply_markup: buildReportSectionConfigurationKeyboard(locale, type, sections),
    },
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

async function showExistingReportMenu(
  telegramApi: TelegramApi,
  session: ReportSession,
): Promise<void> {
  if (!session.existingReport) throw new Error('Existing report is required');
  const locale = getLocale(session.userId);
  await telegramApi.editMessageText(
    session.collector.chatId,
    session.collector.messageId,
    renderExistingReportMenu(locale, session.existingReport),
    {
      parse_mode: 'HTML',
      reply_markup: buildExistingReportKeyboard(locale),
    },
  );
}

async function finishReport(telegramApi: TelegramApi, session: ReportSession): Promise<void> {
  if (!session.type) throw new Error('A report type is required to finish a report');
  if (finishingReportUserIds.has(session.userId)) return;
  finishingReportUserIds.add(session.userId);
  const answers = currentTypeAnswers(session);
  const report =
    session.type === 'daily'
      ? formatDailyReport(
          answers,
          session.calendar,
          session.authorTag,
          session.configuration.dailySections,
        )
      : formatWeeklyReport(
          answers,
          session.calendar,
          session.authorTag,
          session.configuration.weeklySections,
        );
  const apiClient = requireApiClient();
  const period = calculateReportPeriod(session.type, session.calendar, session.startDate);
  const configuration = sectionsForType(session, session.type);

  try {
    if (session.existingReport && session.replaceMode) {
      await replaceExistingReport(telegramApi, apiClient, session, report, answers, configuration);
      await closeReportCollector(telegramApi, session);
      return;
    }

    const claim = await apiClient.claimReportDelivery(session.userId, {
      type: session.type,
      ...period,
      text: report,
      answers,
      configuration,
    });

    if (shouldKeepReportCollector(claim.outcome)) {
      await sendTemporaryNotice(
        telegramApi,
        session,
        translate(getLocale(session.userId), 'report.deliveryBusy'),
      );
      return;
    }

    if (claim.outcome === 'claimed') {
      let sentMessage: Awaited<ReturnType<TelegramApi['sendMessage']>>;
      try {
        sentMessage = await telegramApi.sendMessage(session.collector.chatId, report, {
          parse_mode: 'HTML',
        });
      } catch (error) {
        await apiClient
          .failReportDelivery(claim.reportId, claim.deliveryToken, reportDeliveryError(error))
          .catch(() => undefined);
        throw error;
      }

      await apiClient.completeReportDelivery(
        claim.reportId,
        claim.deliveryToken,
        sentMessage.message_id,
      );
    }

    await closeReportCollector(telegramApi, session);
  } finally {
    finishingReportUserIds.delete(session.userId);
  }
}

async function replaceExistingReport(
  telegramApi: TelegramApi,
  apiClient: AionApiClient,
  session: ReportSession,
  text: string,
  answers: v1.TelegramReportAnswers,
  configuration: v1.TelegramReportField[],
): Promise<void> {
  const existing = session.existingReport;
  if (!existing) throw new Error('Existing report is required');
  const existingMessageId = Number(existing.telegramMessageId);
  let telegramMessageId: number | null = null;

  if (Number.isSafeInteger(existingMessageId) && existingMessageId > 0) {
    if (existing.text === text) {
      telegramMessageId = existingMessageId;
    } else {
      await telegramApi
        .editMessageText(session.collector.chatId, existingMessageId, text, {
          parse_mode: 'HTML',
        })
        .then(() => {
          telegramMessageId = existingMessageId;
        })
        .catch(() => undefined);
    }
  }

  if (!telegramMessageId) {
    const message = await telegramApi.sendMessage(session.collector.chatId, text, {
      parse_mode: 'HTML',
    });
    telegramMessageId = message.message_id;
  }

  await apiClient.replaceReport(session.userId, {
    reportId: existing.id,
    expectedRevision: existing.revision,
    text,
    answers,
    configuration,
    telegramMessageId: String(telegramMessageId),
  });
}

async function closeReportCollector(
  telegramApi: TelegramApi,
  session: ReportSession,
): Promise<void> {
  sessionsByUserId.delete(session.userId);
  releaseTextInput(session.userId, 'report');
  await telegramApi
    .deleteMessage(session.collector.chatId, session.collector.messageId)
    .catch(() => undefined);
}

async function advanceOrFinishReport(
  telegramApi: TelegramApi,
  session: ReportSession,
): Promise<void> {
  if (advanceReportStep(session)) {
    await refreshCollector(telegramApi, session);
    return;
  }

  await finishReport(telegramApi, session);
}

function currentDateKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function reportDeliveryError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown Telegram delivery error';
}

function requireApiClient(): AionApiClient {
  if (!registeredApiClient) throw new Error('Report API client is not registered');
  return registeredApiClient;
}

function configuredFields(setup: ReportSetupSession, type: ReportType): ReportField[] {
  return type === 'daily' ? setup.dailySections : setup.weeklySections;
}

function editingSetupField(setup: ReportSetupSession): ReportField | null {
  if (!setup.configuringType || !setup.editingFieldId) return null;
  return (
    configuredFields(setup, setup.configuringType).find(
      field => field.id === setup.editingFieldId,
    ) ?? null
  );
}

async function showReportFieldEditor(
  telegramApi: TelegramApi,
  setup: ReportSetupSession,
): Promise<void> {
  const field = editingSetupField(setup);
  if (!field) throw new Error('A report field is required for the field editor');

  setup.step = 'field-editor';
  releaseTextInput(setup.userId, 'report');
  const locale = getLocale(setup.userId);
  await telegramApi.editMessageText(
    setup.collector.chatId,
    setup.collector.messageId,
    renderReportFieldEditor(locale, field),
    { parse_mode: 'HTML', reply_markup: buildReportFieldEditorKeyboard(locale, field) },
  );
}

async function showReportFieldTextPrompt(
  telegramApi: TelegramApi,
  setup: ReportSetupSession,
  step: 'field-title' | 'field-prompt',
): Promise<void> {
  setup.step = step;
  claimTextInput(setup.userId, 'report');
  const locale = getLocale(setup.userId);
  const field = editingSetupField(setup);
  if (!field) throw new Error('A report field is required for text editing');
  const currentValue = step === 'field-title' ? field.title : field.prompt;
  await telegramApi.editMessageText(
    setup.collector.chatId,
    setup.collector.messageId,
    renderReportFieldTextPrompt(locale, field, step === 'field-title' ? 'title' : 'prompt'),
    {
      parse_mode: 'HTML',
      reply_markup: buildReportFieldTextInputKeyboard(locale, currentValue),
    },
  );
}

function makeReportFieldId(fields: ReportField[]): string {
  const existingIds = new Set(fields.map(field => field.id));
  const base = `field-${Date.now().toString(36)}`;
  let candidate = base;
  let suffix = 2;
  while (existingIds.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}
