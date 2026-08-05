import type { v1 } from '@aion/contracts';
import { Bot, InlineKeyboard, type Api as TelegramApi, type Context } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import {
  addCopyCurrentTextButton,
  renderCopyableText,
} from '../../core/formatting/copyable-text.js';
import { dateLocale, getLocale, translate } from '../../core/i18n/i18n.js';
import {
  claimTextInput,
  ownsTextInput,
  releaseTextInput,
} from '../../core/interactions/text-input-owner.js';
import {
  currentKyivDateKey,
  formatDateKeyInput,
  kyivTimeZone,
  parseDateKeyInput,
  shiftDateKey,
} from '../../core/time/kyiv-calendar.js';

const dateKeyPattern = '\\d{4}-\\d{2}-\\d{2}';
const moveItemCallbackPattern = new RegExp(`^dp:mv:(${dateKeyPattern}):([^:]+)$`);
const moveQuickDateCallbackPattern = new RegExp(
  `^dp:mq:(${dateKeyPattern}):([^:]+):(${dateKeyPattern})$`,
);
const openMovedPlanCallbackPattern = new RegExp(`^dp:mo:(${dateKeyPattern})$`);

interface MessageReference {
  chatId: number;
  messageId: number;
}

export interface MovePendingInput {
  kind: 'move-date';
  date: string;
  itemId: string;
  itemText: string;
  prompt: MessageReference;
}

interface MoveHandlerDependencies<TState> {
  stateForOwner(ownerId: number): TState;
  ownerId(state: TState): number;
  pendingMove(state: TState): MovePendingInput | null;
  setPendingMove(state: TState, pendingInput: MovePendingInput | null): void;
  setManagementMessage(state: TState, message: MessageReference | null, date?: string): void;
  refreshManagementMessage(
    telegramApi: TelegramApi,
    state: TState,
    plan: v1.TelegramDailyPlanDto,
  ): Promise<void>;
  refreshPlanPanel(
    telegramApi: TelegramApi,
    state: TState,
    plan: v1.TelegramDailyPlanDto,
  ): Promise<boolean>;
  restoreItemPanel(context: Context, plan: v1.TelegramDailyPlanDto, itemId: string): Promise<void>;
  showSelectedPlan(context: Context, state: TState, plan: v1.TelegramDailyPlanDto): Promise<void>;
}

export function registerDailyPlanMoveHandlers<TState>(
  bot: Bot,
  apiClient: AionApiClient,
  dependencies: MoveHandlerDependencies<TState>,
): void {
  registerMoveItemHandler(bot, apiClient, dependencies);
  registerQuickDateHandler(bot, apiClient, dependencies);
  registerCancelMoveHandler(bot, apiClient, dependencies);
  registerOpenMovedPlanHandler(bot, apiClient, dependencies);
  registerMoveDateInputHandler(bot, apiClient, dependencies);
}

function registerMoveItemHandler<TState>(
  bot: Bot,
  apiClient: AionApiClient,
  dependencies: MoveHandlerDependencies<TState>,
): void {
  bot.callbackQuery(moveItemCallbackPattern, async context => {
    const state = dependencies.stateForOwner(context.from.id);
    const ownerId = dependencies.ownerId(state);
    const locale = getLocale(ownerId);
    const match = requiredMatch(context.callbackQuery.data, moveItemCallbackPattern);
    const date = match[1]!;
    const itemId = match[2]!;
    const plan = await apiClient.getOrCreateDailyPlan(ownerId, date);

    if (plan.date < currentKyivDateKey()) {
      await context.answerCallbackQuery(translate(locale, 'daily.readOnlyAction'));
      return;
    }

    const item = plan.items.find(candidate => candidate.id === itemId);

    if (!item) {
      await context.answerCallbackQuery(translate(locale, 'daily.actionExpired'));
      await dependencies.refreshManagementMessage(context.api, state, plan);
      return;
    }

    if (item.completed) {
      await context.answerCallbackQuery(translate(locale, 'daily.moveCompleted'));
      return;
    }

    const managementMessage = context.callbackQuery.message;

    if (!managementMessage) {
      await context.answerCallbackQuery(translate(locale, 'daily.panelUnavailable'));
      return;
    }

    clearPendingMove(state, dependencies);
    const prompt = messageReference(managementMessage);
    dependencies.setManagementMessage(state, prompt, plan.date);
    dependencies.setPendingMove(state, {
      kind: 'move-date',
      date: plan.date,
      itemId: item.id,
      itemText: item.text,
      prompt,
    });
    claimTextInput(ownerId, 'daily-plan');
    await context.answerCallbackQuery();
    await context.editMessageText(renderMovePrompt(locale, plan.date, item.text), {
      parse_mode: 'HTML',
      reply_markup: buildMoveDateKeyboard(locale, plan.date, item.id, item.text),
    });
  });
}

function registerQuickDateHandler<TState>(
  bot: Bot,
  apiClient: AionApiClient,
  dependencies: MoveHandlerDependencies<TState>,
): void {
  bot.callbackQuery(moveQuickDateCallbackPattern, async context => {
    const state = dependencies.stateForOwner(context.from.id);
    const locale = getLocale(dependencies.ownerId(state));
    const pendingInput = dependencies.pendingMove(state);
    const match = requiredMatch(context.callbackQuery.data, moveQuickDateCallbackPattern);
    const sourceDate = match[1]!;
    const itemId = match[2]!;
    const targetDate = match[3]!;

    if (
      !pendingInput ||
      pendingInput.date !== sourceDate ||
      pendingInput.itemId !== itemId ||
      pendingInput.prompt.messageId !== context.callbackQuery.message?.message_id
    ) {
      await context.answerCallbackQuery(translate(locale, 'daily.actionExpired'));
      return;
    }

    const validationError = moveDateValidationError(locale, pendingInput.date, targetDate);
    if (validationError) {
      await context.answerCallbackQuery(validationError);
      await showMoveDateError(context.api, locale, pendingInput, validationError);
      return;
    }

    await context.answerCallbackQuery();
    await movePendingItem(context.api, state, pendingInput, targetDate, apiClient, dependencies);
  });
}

function registerCancelMoveHandler<TState>(
  bot: Bot,
  apiClient: AionApiClient,
  dependencies: MoveHandlerDependencies<TState>,
): void {
  bot.callbackQuery('daily-plan:cancel-move', async context => {
    const state = dependencies.stateForOwner(context.from.id);
    const locale = getLocale(dependencies.ownerId(state));
    const pendingInput = dependencies.pendingMove(state);

    if (
      !pendingInput ||
      pendingInput.prompt.messageId !== context.callbackQuery.message?.message_id
    ) {
      await context.answerCallbackQuery(translate(locale, 'daily.actionExpired'));
      return;
    }

    const plan = await apiClient.getOrCreateDailyPlan(
      dependencies.ownerId(state),
      pendingInput.date,
    );
    clearPendingMove(state, dependencies);
    await context.answerCallbackQuery(translate(locale, 'daily.cancelled'));
    await dependencies.restoreItemPanel(context, plan, pendingInput.itemId);
  });
}

function registerOpenMovedPlanHandler<TState>(
  bot: Bot,
  apiClient: AionApiClient,
  dependencies: MoveHandlerDependencies<TState>,
): void {
  bot.callbackQuery(openMovedPlanCallbackPattern, async context => {
    const state = dependencies.stateForOwner(context.from.id);
    const targetDate = requiredMatch(context.callbackQuery.data, openMovedPlanCallbackPattern)[1]!;
    const plan = await apiClient.getOrCreateDailyPlan(dependencies.ownerId(state), targetDate);
    dependencies.setManagementMessage(state, null);
    clearPendingMove(state, dependencies);
    await context.answerCallbackQuery();
    await context.deleteMessage().catch(() => undefined);
    await dependencies.showSelectedPlan(context, state, plan);
  });
}

function registerMoveDateInputHandler<TState>(
  bot: Bot,
  apiClient: AionApiClient,
  dependencies: MoveHandlerDependencies<TState>,
): void {
  bot.on('message:text', async (context, next) => {
    const state = dependencies.stateForOwner(context.from.id);
    const ownerId = dependencies.ownerId(state);
    const pendingInput = dependencies.pendingMove(state);

    if (
      !pendingInput ||
      !ownsTextInput(ownerId, 'daily-plan') ||
      context.message.text.startsWith('/')
    ) {
      await next();
      return;
    }

    const locale = getLocale(ownerId);
    const targetDate = parseDateKeyInput(context.message.text.trim());
    await context.deleteMessage().catch(() => undefined);

    if (!targetDate) {
      await showMoveDateError(
        context.api,
        locale,
        pendingInput,
        translate(locale, 'daily.invalidDate'),
      );
      return;
    }

    const validationError = moveDateValidationError(locale, pendingInput.date, targetDate);
    if (validationError) {
      await showMoveDateError(context.api, locale, pendingInput, validationError);
      return;
    }

    await movePendingItem(context.api, state, pendingInput, targetDate, apiClient, dependencies);
  });
}

async function movePendingItem<TState>(
  telegramApi: TelegramApi,
  state: TState,
  pendingInput: MovePendingInput,
  targetDate: string,
  apiClient: AionApiClient,
  dependencies: MoveHandlerDependencies<TState>,
): Promise<void> {
  const locale = getLocale(dependencies.ownerId(state));
  const result = await apiClient.moveDailyPlanItem(
    dependencies.ownerId(state),
    pendingInput.date,
    pendingInput.itemId,
    targetDate,
  );

  clearPendingMove(state, dependencies);
  dependencies.setManagementMessage(state, pendingInput.prompt, result.sourcePlan.date);
  await telegramApi.editMessageText(
    pendingInput.prompt.chatId,
    pendingInput.prompt.messageId,
    renderMoveSuccess(
      locale,
      pendingInput.itemText,
      result.sourcePlan.date,
      result.targetPlan.date,
    ),
    {
      parse_mode: 'HTML',
      reply_markup: buildMoveSuccessKeyboard(
        locale,
        result.sourcePlan.date,
        result.targetPlan.date,
        pendingInput.itemText,
      ),
    },
  );
  await dependencies.refreshPlanPanel(telegramApi, state, result.sourcePlan);
}

function clearPendingMove<TState>(
  state: TState,
  dependencies: MoveHandlerDependencies<TState>,
): void {
  dependencies.setPendingMove(state, null);
  releaseTextInput(dependencies.ownerId(state), 'daily-plan');
}

async function showMoveDateError(
  telegramApi: TelegramApi,
  locale: ReturnType<typeof getLocale>,
  pendingInput: MovePendingInput,
  error: string,
): Promise<void> {
  await telegramApi.editMessageText(
    pendingInput.prompt.chatId,
    pendingInput.prompt.messageId,
    `${error}\n\n${renderMovePrompt(locale, pendingInput.date, pendingInput.itemText)}`,
    {
      parse_mode: 'HTML',
      reply_markup: buildMoveDateKeyboard(
        locale,
        pendingInput.date,
        pendingInput.itemId,
        pendingInput.itemText,
      ),
    },
  );
}

function moveDateValidationError(
  locale: ReturnType<typeof getLocale>,
  sourceDate: string,
  targetDate: string,
): string | null {
  if (targetDate === sourceDate) return translate(locale, 'daily.moveSameDate');
  if (targetDate < currentKyivDateKey()) return translate(locale, 'daily.movePastDate');
  return null;
}

function renderMovePrompt(
  locale: ReturnType<typeof getLocale>,
  sourceDate: string,
  itemText: string,
): string {
  return [
    `<b>${translate(locale, 'daily.moveTitle')}</b>`,
    '',
    renderCopyableText(itemText),
    translate(locale, 'daily.moveSourceDate', {
      date: formatPlanDate(sourceDate, locale),
    }),
    '',
    translate(locale, 'daily.movePrompt', {
      example: formatDateKeyInput(shiftDateKey(currentKyivDateKey(), 1)),
    }),
  ].join('\n');
}

function renderMoveSuccess(
  locale: ReturnType<typeof getLocale>,
  itemText: string,
  sourceDate: string,
  targetDate: string,
): string {
  return [
    `<b>${translate(locale, 'daily.moveSuccessTitle')}</b>`,
    '',
    renderCopyableText(itemText),
    translate(locale, 'daily.moveSuccessDates', {
      sourceDate: formatPlanDate(sourceDate, locale),
      targetDate: formatPlanDate(targetDate, locale),
    }),
  ].join('\n');
}

function buildMoveDateKeyboard(
  locale: ReturnType<typeof getLocale>,
  sourceDate: string,
  itemId: string,
  itemText: string,
): InlineKeyboard {
  const keyboard = addCopyCurrentTextButton(new InlineKeyboard(), locale, itemText);
  const today = currentKyivDateKey();
  const quickDates = [
    { label: translate(locale, 'daily.today'), date: today },
    { label: translate(locale, 'daily.tomorrow'), date: shiftDateKey(today, 1) },
    { label: translate(locale, 'daily.inOneWeek'), date: shiftDateKey(today, 7) },
  ].filter(candidate => candidate.date !== sourceDate);

  for (const candidate of quickDates) {
    keyboard.text(candidate.label, `dp:mq:${sourceDate}:${itemId}:${candidate.date}`).row();
  }

  return keyboard.text(translate(locale, 'daily.cancel'), 'daily-plan:cancel-move');
}

function buildMoveSuccessKeyboard(
  locale: ReturnType<typeof getLocale>,
  sourceDate: string,
  targetDate: string,
  itemText: string,
): InlineKeyboard {
  return addCopyCurrentTextButton(new InlineKeyboard(), locale, itemText)
    .text(translate(locale, 'daily.openMovedPlan'), `dp:mo:${targetDate}`)
    .row()
    .text(translate(locale, 'daily.backToManagement'), `dp:ml:${sourceDate}`);
}

function formatPlanDate(date: string, locale: ReturnType<typeof getLocale>): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    timeZone: kyivTimeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function messageReference(message: { chat: { id: number }; message_id: number }): MessageReference {
  return { chatId: message.chat.id, messageId: message.message_id };
}

function requiredMatch(data: string, pattern: RegExp): RegExpExecArray {
  const match = pattern.exec(data);
  if (!match) throw new Error(`Unexpected daily plan move callback: ${data}`);
  return match;
}
