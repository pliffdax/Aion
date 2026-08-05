import type { v1 } from '@aion/contracts';
import { Bot, InlineKeyboard, type Api as TelegramApi, type Context } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import type { Command } from '../../core/commands/command.js';
import {
  addCopyCurrentTextButton,
  renderCopyableText,
} from '../../core/formatting/copyable-text.js';
import { escapeHtml } from '../../core/formatting/html.js';
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
import { isTelegramMessageNotModified } from '../../core/telegram-errors.js';
import { registerDailyPlanMoveHandlers, type MovePendingInput } from './plan-move.js';

const timeZone = kyivTimeZone;
const maxItems = 20;
const maxItemLength = 160;
const maxDescriptionLength = 2000;
const dateKeyPattern = '\\d{4}-\\d{2}-\\d{2}';
const openDateCallbackPattern = new RegExp(`^dp:o:(${dateKeyPattern})$`);
const chooseDateCallbackPattern = new RegExp(`^dp:c:(${dateKeyPattern})$`);
const pickDateCallbackPattern = new RegExp(`^dp:p:(${dateKeyPattern})$`);
const addCallbackPattern = new RegExp(`^(?:daily-plan:add|dp:a:(${dateKeyPattern}))$`);
const manageCallbackPattern = new RegExp(`^(?:daily-plan:manage|dp:m:(${dateKeyPattern}))$`);
const toggleCallbackPattern = new RegExp(
  `^(?:daily-plan:toggle:([^:]+)|dp:t:(${dateKeyPattern}):([^:]+))$`,
);
const hideCompletedCallbackPattern = new RegExp(
  `^(?:daily-plan:(?:clear|hide)-completed|dp:h:(${dateKeyPattern}))$`,
);
const showCompletedCallbackPattern = new RegExp(
  `^(?:daily-plan:show-completed|dp:s:(${dateKeyPattern}))$`,
);
const manageToggleCallbackPattern = new RegExp(
  `^(?:daily-plan:manage-toggle:([^:]+)|dp:mt:(${dateKeyPattern}):([^:]+))$`,
);
const openManagementItemCallbackPattern = new RegExp(
  `^(?:daily-plan:item:([^:]+)|dp:i:(${dateKeyPattern}):([^:]+))$`,
);
const managementListCallbackPattern = new RegExp(
  `^(?:daily-plan:management-list|dp:ml:(${dateKeyPattern}))$`,
);
const manageItemCallbackPattern = new RegExp(
  `^(?:daily-plan:(edit|description|delete):([^:]+)|dp:(e|d|x):(${dateKeyPattern}):([^:]+))$`,
);
const confirmDeleteCallbackPattern = new RegExp(
  `^(?:daily-plan:confirm-delete:([^:]+)|dp:xd:(${dateKeyPattern}):([^:]+))$`,
);
const clearDescriptionCallbackPattern = new RegExp(
  `^(?:daily-plan:clear-description:([^:]+)|dp:cd:(${dateKeyPattern}):([^:]+))$`,
);

interface MessageReference {
  chatId: number;
  messageId: number;
}

interface DatedMessageReference extends MessageReference {
  date: string;
}

type PendingInput =
  | { kind: 'select-date'; date: string; prompt: MessageReference }
  | { kind: 'add-title'; date: string; prompt: MessageReference }
  | { kind: 'add-description-choice'; date: string; text: string; prompt: MessageReference }
  | { kind: 'add-description'; date: string; text: string; prompt: MessageReference }
  | {
      kind: 'edit-title';
      date: string;
      itemId: string;
      currentValue: string;
      prompt: MessageReference;
    }
  | {
      kind: 'edit-description';
      date: string;
      itemId: string;
      currentValue: string | null;
      prompt: MessageReference;
    }
  | MovePendingInput;

interface DailyPlanInteractionState {
  ownerId: number;
  activePanel: DatedMessageReference | null;
  managementMessage: DatedMessageReference | null;
  pendingInput: PendingInput | null;
  hideCompleted: boolean;
}

const statesByOwnerId = new Map<number, DailyPlanInteractionState>();

export const command: Command = {
  name: 'plan',
  descriptionKey: 'command.plan.description',
  access: 'user',
  async handle(context) {
    const state = stateForOwner(context.from?.id);
    const apiClient = requireApiClient();
    const plan = await loadPlan(apiClient, state.ownerId, currentDateKey());
    state.hideCompleted = false;

    await prepareTransientSurface(context.api, state);

    const panel = await context.reply(renderPlan(plan, state.hideCompleted), {
      parse_mode: 'HTML',
      reply_markup: buildPlanKeyboard(plan, state.hideCompleted),
    });

    state.activePanel = datedMessageReference(panel, plan.date);
  },
};

let registeredApiClient: AionApiClient | null = null;

export function registerDailyPlanHandlers(bot: Bot, apiClient: AionApiClient): void {
  registeredApiClient = apiClient;

  registerDailyPlanMoveHandlers(bot, apiClient, {
    stateForOwner,
    ownerId: state => state.ownerId,
    pendingMove: state => (state.pendingInput?.kind === 'move-date' ? state.pendingInput : null),
    setPendingMove: (state, pendingInput) => {
      state.pendingInput = pendingInput;
    },
    setManagementMessage: (state, message, date) => {
      state.managementMessage = message && date ? { ...message, date } : null;
    },
    refreshManagementMessage,
    refreshPlanPanel,
    restoreItemPanel,
    showSelectedPlan,
  });

  bot.callbackQuery(openDateCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const date = requiredMatch(context.callbackQuery.data, openDateCallbackPattern)[1]!;
    const plan = await loadPlan(apiClient, state.ownerId, date);
    const panelMessage = context.callbackQuery.message;

    await prepareTransientSurface(context.api, state);
    state.hideCompleted = false;
    await context.answerCallbackQuery();

    if (panelMessage) {
      state.activePanel = datedMessageReference(panelMessage, plan.date);
    }

    await context.editMessageText(renderPlan(plan, state.hideCompleted), {
      parse_mode: 'HTML',
      reply_markup: buildPlanKeyboard(plan, state.hideCompleted),
    });
  });

  bot.callbackQuery(chooseDateCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const currentDate = requiredMatch(context.callbackQuery.data, chooseDateCallbackPattern)[1]!;
    const panelMessage = context.callbackQuery.message;

    if (!panelMessage) {
      await context.answerCallbackQuery(translate(locale, 'daily.panelUnavailable'));
      return;
    }

    state.activePanel = datedMessageReference(panelMessage, currentDate);
    await prepareTransientSurface(context.api, state);
    await context.answerCallbackQuery();

    const prompt = await context.reply(renderDatePrompt(locale, currentDate), {
      parse_mode: 'HTML',
      reply_markup: buildDateChoiceKeyboard(locale),
    });
    state.pendingInput = {
      kind: 'select-date',
      date: currentDate,
      prompt: messageReference(prompt),
    };
    claimTextInput(state.ownerId, 'daily-plan');
  });

  bot.callbackQuery(pickDateCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const pendingInput = state.pendingInput;

    if (
      pendingInput?.kind !== 'select-date' ||
      !isPromptCallback(pendingInput, context.callbackQuery.message?.message_id)
    ) {
      await context.answerCallbackQuery(translate(locale, 'daily.actionExpired'));
      return;
    }

    const date = requiredMatch(context.callbackQuery.data, pickDateCallbackPattern)[1]!;
    const plan = await loadPlan(apiClient, state.ownerId, date);
    state.pendingInput = null;
    releaseTextInput(state.ownerId, 'daily-plan');
    await context.answerCallbackQuery();
    await context.deleteMessage().catch(() => undefined);
    await showSelectedPlan(context, state, plan);
  });

  bot.callbackQuery(addCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const match = requiredMatch(context.callbackQuery.data, addCallbackPattern);
    const date = match[1] ?? currentDateKey();
    const plan = await loadPlan(apiClient, state.ownerId, date);

    if (!isEditablePlanDate(plan.date)) {
      await context.answerCallbackQuery(translate(locale, 'daily.readOnlyAction'));
      return;
    }

    await context.answerCallbackQuery();

    if (plan.items.length >= maxItems) {
      await context.reply(translate(locale, 'daily.maxItems', { max: maxItems }));
      return;
    }

    const panelMessage = context.callbackQuery.message;

    if (!panelMessage) {
      await context.reply(translate(locale, 'daily.panelUnavailable'));
      return;
    }

    state.activePanel = datedMessageReference(panelMessage, plan.date);
    await removePendingPrompt(context.api, state);

    const prompt = await context.reply(
      translate(locale, 'daily.addPrompt', {
        date: formatPlanDate(plan.date, locale),
        max: maxItemLength,
      }),
      {
        reply_markup: new InlineKeyboard().text(
          translate(locale, 'daily.cancel'),
          'daily-plan:cancel-input',
        ),
      },
    );

    state.pendingInput = {
      kind: 'add-title',
      date: plan.date,
      prompt: messageReference(prompt),
    };
    claimTextInput(state.ownerId, 'daily-plan');
  });

  bot.callbackQuery(manageCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const match = requiredMatch(context.callbackQuery.data, manageCallbackPattern);
    const date = match[1] ?? currentDateKey();
    const plan = await loadPlan(apiClient, state.ownerId, date);

    if (!isEditablePlanDate(plan.date)) {
      await context.answerCallbackQuery(translate(locale, 'daily.readOnlyAction'));
      return;
    }

    await prepareTransientSurface(context.api, state);
    await context.answerCallbackQuery();

    const panelMessage = context.callbackQuery.message;

    if (!panelMessage) return;

    state.activePanel = datedMessageReference(panelMessage, plan.date);

    const managementMessage = await context.reply(renderManagement(plan), {
      parse_mode: 'HTML',
      reply_markup: buildManagementKeyboard(plan),
    });

    state.managementMessage = datedMessageReference(managementMessage, plan.date);
  });

  bot.callbackQuery('daily-plan:management-done', async context => {
    const state = stateForOwner(context.from.id);
    state.managementMessage = null;
    await removePendingPrompt(context.api, state);
    await context.answerCallbackQuery();
    await context.deleteMessage();
  });

  bot.callbackQuery('daily-plan:cancel-input', async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const promptMessageId = context.callbackQuery.message?.message_id;

    if (state.pendingInput?.prompt.messageId === promptMessageId) {
      state.pendingInput = null;
      releaseTextInput(state.ownerId, 'daily-plan');
    }

    await context.answerCallbackQuery(translate(locale, 'daily.cancelled'));
    await context.deleteMessage();
  });

  bot.callbackQuery('daily-plan:cancel-edit', async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const pendingInput = state.pendingInput;

    if (
      !pendingInput ||
      (pendingInput.kind !== 'edit-title' && pendingInput.kind !== 'edit-description') ||
      !isPromptCallback(pendingInput, context.callbackQuery.message?.message_id)
    ) {
      await context.answerCallbackQuery(translate(locale, 'daily.actionExpired'));
      return;
    }

    if (!isEditablePlanDate(pendingInput.date)) {
      state.pendingInput = null;
      releaseTextInput(state.ownerId, 'daily-plan');
      await context.answerCallbackQuery(translate(locale, 'daily.readOnlyAction'));
      await context.deleteMessage().catch(() => undefined);
      return;
    }

    const plan = await loadPlan(apiClient, state.ownerId, pendingInput.date);
    const item = plan.items.find(candidate => candidate.id === pendingInput.itemId);
    state.pendingInput = null;
    releaseTextInput(state.ownerId, 'daily-plan');
    await context.answerCallbackQuery(translate(locale, 'daily.cancelled'));

    if (!item) {
      await context.editMessageText(renderManagement(plan), {
        parse_mode: 'HTML',
        reply_markup: buildManagementKeyboard(plan),
      });
      return;
    }

    await context.editMessageText(renderItemDetails(locale, plan, item), {
      parse_mode: 'HTML',
      reply_markup: buildItemDetailsKeyboard(locale, plan.date, item),
    });
  });

  bot.callbackQuery('daily-plan:add-description', async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const pendingInput = state.pendingInput;

    if (
      pendingInput?.kind !== 'add-description-choice' ||
      !isPromptCallback(pendingInput, context.callbackQuery.message?.message_id)
    ) {
      await context.answerCallbackQuery(translate(locale, 'daily.actionExpired'));
      return;
    }

    if (!isEditablePlanDate(pendingInput.date)) {
      state.pendingInput = null;
      releaseTextInput(state.ownerId, 'daily-plan');
      await context.answerCallbackQuery(translate(locale, 'daily.readOnlyAction'));
      await context.deleteMessage().catch(() => undefined);
      return;
    }

    state.pendingInput = {
      kind: 'add-description',
      date: pendingInput.date,
      text: pendingInput.text,
      prompt: pendingInput.prompt,
    };
    claimTextInput(state.ownerId, 'daily-plan');
    await context.answerCallbackQuery();
    await context.editMessageText(
      [
        translate(locale, 'daily.dateLabel', {
          date: formatPlanDate(pendingInput.date, locale),
        }),
        '',
        translate(locale, 'daily.descriptionPrompt', { max: maxDescriptionLength }),
      ].join('\n'),
      {
        reply_markup: buildCancelKeyboard(locale),
      },
    );
  });

  bot.callbackQuery('daily-plan:add-without-description', async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const pendingInput = state.pendingInput;

    if (
      pendingInput?.kind !== 'add-description-choice' ||
      !isPromptCallback(pendingInput, context.callbackQuery.message?.message_id)
    ) {
      await context.answerCallbackQuery(translate(locale, 'daily.actionExpired'));
      return;
    }

    if (!isEditablePlanDate(pendingInput.date)) {
      state.pendingInput = null;
      releaseTextInput(state.ownerId, 'daily-plan');
      await context.answerCallbackQuery(translate(locale, 'daily.readOnlyAction'));
      await context.deleteMessage().catch(() => undefined);
      return;
    }

    const plan = await apiClient.addDailyPlanItem(
      state.ownerId,
      pendingInput.date,
      pendingInput.text,
    );
    state.pendingInput = null;
    releaseTextInput(state.ownerId, 'daily-plan');
    await context.answerCallbackQuery(translate(locale, 'daily.itemAdded'));
    await context.deleteMessage().catch(() => undefined);
    await showUpdatedPlan(context, state, plan);
  });

  bot.callbackQuery(toggleCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const target = parseItemCallback(context.callbackQuery.data, toggleCallbackPattern);
    let plan = await loadPlan(apiClient, state.ownerId, target.date);

    if (!isEditablePlanDate(plan.date)) {
      await context.answerCallbackQuery(
        translate(getLocale(state.ownerId), 'daily.readOnlyAction'),
      );
      return;
    }

    await context.answerCallbackQuery();

    const item = plan.items.find(candidate => candidate.id === target.itemId);

    if (item) {
      plan = await apiClient.toggleDailyPlanItem(state.ownerId, plan.date, item.id);
    }

    const panelMessage = context.callbackQuery.message;

    if (panelMessage) {
      state.activePanel = datedMessageReference(panelMessage, plan.date);
    }

    await context.editMessageText(renderPlan(plan, state.hideCompleted), {
      parse_mode: 'HTML',
      reply_markup: buildPlanKeyboard(plan, state.hideCompleted),
    });
    await refreshManagementMessage(context.api, state, plan);
  });

  bot.callbackQuery(hideCompletedCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const match = requiredMatch(context.callbackQuery.data, hideCompletedCallbackPattern);
    const plan = await loadPlan(apiClient, state.ownerId, match[1] ?? currentDateKey());
    state.hideCompleted = true;
    await context.answerCallbackQuery();

    await context.editMessageText(renderPlan(plan, state.hideCompleted), {
      parse_mode: 'HTML',
      reply_markup: buildPlanKeyboard(plan, state.hideCompleted),
    });
    await refreshManagementMessage(context.api, state, plan);
  });

  bot.callbackQuery(showCompletedCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const match = requiredMatch(context.callbackQuery.data, showCompletedCallbackPattern);
    const plan = await loadPlan(apiClient, state.ownerId, match[1] ?? currentDateKey());
    state.hideCompleted = false;
    await context.answerCallbackQuery();

    await context.editMessageText(renderPlan(plan, state.hideCompleted), {
      parse_mode: 'HTML',
      reply_markup: buildPlanKeyboard(plan, state.hideCompleted),
    });
    await refreshManagementMessage(context.api, state, plan);
  });

  bot.callbackQuery(manageToggleCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const target = parseItemCallback(context.callbackQuery.data, manageToggleCallbackPattern);
    let plan = await loadPlan(apiClient, state.ownerId, target.date);

    if (!isEditablePlanDate(plan.date)) {
      await context.answerCallbackQuery(translate(locale, 'daily.readOnlyAction'));
      return;
    }

    const item = plan.items.find(candidate => candidate.id === target.itemId);

    if (item) {
      plan = await apiClient.toggleDailyPlanItem(state.ownerId, plan.date, item.id);
    }

    await context.answerCallbackQuery();
    const updatedItem = item && plan.items.find(candidate => candidate.id === item.id);

    if (!updatedItem) {
      await context.editMessageText(renderManagement(plan), {
        parse_mode: 'HTML',
        reply_markup: buildManagementKeyboard(plan),
      });
    } else {
      await context.editMessageText(renderItemDetails(locale, plan, updatedItem), {
        parse_mode: 'HTML',
        reply_markup: buildItemDetailsKeyboard(locale, plan.date, updatedItem),
      });
    }

    await refreshPlanPanel(context.api, state, plan);
  });

  bot.callbackQuery(openManagementItemCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const target = parseItemCallback(context.callbackQuery.data, openManagementItemCallbackPattern);
    const plan = await loadPlan(apiClient, state.ownerId, target.date);
    const item = plan.items.find(candidate => candidate.id === target.itemId);

    await context.answerCallbackQuery();

    if (!item) {
      await context.editMessageText(renderManagement(plan), {
        parse_mode: 'HTML',
        reply_markup: buildManagementKeyboard(plan),
      });
      return;
    }

    const message = context.callbackQuery.message;

    if (message) {
      state.managementMessage = datedMessageReference(message, plan.date);
    }

    await context.editMessageText(renderItemDetails(locale, plan, item), {
      parse_mode: 'HTML',
      reply_markup: buildItemDetailsKeyboard(locale, plan.date, item),
    });
  });

  bot.callbackQuery(managementListCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const match = requiredMatch(context.callbackQuery.data, managementListCallbackPattern);
    const date = match[1] ?? state.managementMessage?.date ?? currentDateKey();
    const plan = await loadPlan(apiClient, state.ownerId, date);
    await removePendingInputWithoutDeleting(state);
    await context.answerCallbackQuery();
    await context.editMessageText(renderManagement(plan), {
      parse_mode: 'HTML',
      reply_markup: buildManagementKeyboard(plan),
    });
  });

  bot.callbackQuery(manageItemCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const match = manageItemCallbackPattern.exec(context.callbackQuery.data);
    const shortAction = match?.[3];
    const action =
      match?.[1] ?? (shortAction === 'e' ? 'edit' : shortAction === 'd' ? 'description' : 'delete');
    const date = match?.[4] ?? state.managementMessage?.date ?? currentDateKey();
    const itemId = match?.[2] ?? match?.[5];
    const plan = await loadPlan(apiClient, state.ownerId, date);

    if (!isEditablePlanDate(plan.date)) {
      await context.answerCallbackQuery(translate(locale, 'daily.readOnlyAction'));
      return;
    }

    await context.answerCallbackQuery();
    const item = plan.items.find(candidate => candidate.id === itemId);

    if (!item) {
      await refreshManagementMessage(context.api, state, plan);
      return;
    }

    if (action === 'delete') {
      await context.reply(
        `${translate(locale, 'daily.deletePrompt')}\n\n${escapeHtml(item.text)}`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text(translate(locale, 'daily.delete'), `dp:xd:${plan.date}:${item.id}`)
            .text(translate(locale, 'daily.cancel'), 'daily-plan:cancel-delete'),
        },
      );
      return;
    }

    await removePendingInputWithoutDeleting(state);

    const managementMessage = context.callbackQuery.message;

    if (!managementMessage) return;

    state.managementMessage = datedMessageReference(managementMessage, plan.date);

    if (action === 'description') {
      await context.editMessageText(renderDescriptionEditPrompt(locale, plan.date, item), {
        parse_mode: 'HTML',
        reply_markup: buildEditInputKeyboard(locale, item.description),
      });

      state.pendingInput = {
        kind: 'edit-description',
        date: plan.date,
        itemId: item.id,
        currentValue: item.description,
        prompt: messageReference(managementMessage),
      };
      claimTextInput(state.ownerId, 'daily-plan');
      return;
    }

    await context.editMessageText(
      [
        translate(locale, 'daily.dateLabel', { date: formatPlanDate(plan.date, locale) }),
        '',
        translate(locale, 'daily.editPrompt', { max: maxItemLength }),
        '',
        renderCopyableText(item.text),
      ].join('\n'),
      {
        parse_mode: 'HTML',
        reply_markup: buildEditInputKeyboard(locale, item.text),
      },
    );

    state.pendingInput = {
      kind: 'edit-title',
      date: plan.date,
      itemId: item.id,
      currentValue: item.text,
      prompt: messageReference(managementMessage),
    };
    claimTextInput(state.ownerId, 'daily-plan');
  });

  bot.callbackQuery(confirmDeleteCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const target = parseItemCallback(context.callbackQuery.data, confirmDeleteCallbackPattern);
    let plan = await loadPlan(apiClient, state.ownerId, target.date);

    if (!isEditablePlanDate(plan.date)) {
      await context.answerCallbackQuery(translate(locale, 'daily.readOnlyAction'));
      await context.deleteMessage().catch(() => undefined);
      return;
    }

    const item = plan.items.find(candidate => candidate.id === target.itemId);

    if (item) {
      plan = await apiClient.deleteDailyPlanItem(state.ownerId, plan.date, item.id);
    }

    await context.answerCallbackQuery(
      translate(locale, item ? 'daily.itemDeleted' : 'daily.itemMissing'),
    );
    await context.deleteMessage();
    await refreshPlanPanel(context.api, state, plan);
    await refreshManagementMessage(context.api, state, plan);
  });

  bot.callbackQuery(clearDescriptionCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const target = parseItemCallback(context.callbackQuery.data, clearDescriptionCallbackPattern);
    const currentPlan = await loadPlan(apiClient, state.ownerId, target.date);

    if (!isEditablePlanDate(currentPlan.date)) {
      await context.answerCallbackQuery(translate(locale, 'daily.readOnlyAction'));
      return;
    }

    const item = currentPlan.items.find(candidate => candidate.id === target.itemId);

    if (!item) {
      await context.answerCallbackQuery(translate(locale, 'daily.actionExpired'));
      return;
    }

    const plan = await apiClient.updateDailyPlanItem(state.ownerId, currentPlan.date, item.id, {
      description: null,
    });
    state.pendingInput = null;
    releaseTextInput(state.ownerId, 'daily-plan');
    await context.answerCallbackQuery(translate(locale, 'daily.descriptionCleared'));

    const updatedItem = plan.items.find(candidate => candidate.id === item.id);

    if (!updatedItem) {
      await context.editMessageText(renderManagement(plan), {
        parse_mode: 'HTML',
        reply_markup: buildManagementKeyboard(plan),
      });
      return;
    }

    await context.editMessageText(renderItemDetails(locale, plan, updatedItem), {
      parse_mode: 'HTML',
      reply_markup: buildItemDetailsKeyboard(locale, plan.date, updatedItem),
    });
  });

  bot.callbackQuery('daily-plan:cancel-delete', async context => {
    const locale = getLocale(context.from.id);
    await context.answerCallbackQuery(translate(locale, 'daily.deleteCancelled'));
    await context.deleteMessage();
  });

  bot.on('message:text', async (context, next) => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);

    if (
      !state.pendingInput ||
      !acceptsTextInput(state.pendingInput) ||
      !ownsTextInput(state.ownerId, 'daily-plan') ||
      context.message.text.startsWith('/')
    ) {
      await next();
      return;
    }

    const text = context.message.text.trim();
    const pendingInput = state.pendingInput;

    // Move input is consumed by the focused handler registered before this general form handler.
    if (pendingInput.kind === 'move-date') {
      await next();
      return;
    }

    if (pendingInput.kind === 'select-date') {
      const date = parseDateKeyInput(text);
      await context.deleteMessage().catch(() => undefined);

      if (!date) {
        await context.api.editMessageText(
          pendingInput.prompt.chatId,
          pendingInput.prompt.messageId,
          `${translate(locale, 'daily.invalidDate')}\n\n${renderDatePrompt(locale, pendingInput.date)}`,
          {
            parse_mode: 'HTML',
            reply_markup: buildDateChoiceKeyboard(locale),
          },
        );
        return;
      }

      const plan = await loadPlan(apiClient, state.ownerId, date);
      state.pendingInput = null;
      releaseTextInput(state.ownerId, 'daily-plan');
      await context.api
        .deleteMessage(pendingInput.prompt.chatId, pendingInput.prompt.messageId)
        .catch(() => undefined);
      await showSelectedPlan(context, state, plan);
      return;
    }

    if (!isEditablePlanDate(pendingInput.date)) {
      state.pendingInput = null;
      releaseTextInput(state.ownerId, 'daily-plan');
      await context.deleteMessage().catch(() => undefined);
      await context.api
        .editMessageText(
          pendingInput.prompt.chatId,
          pendingInput.prompt.messageId,
          translate(locale, 'daily.readOnlyAction'),
        )
        .catch(() => undefined);
      return;
    }

    const isDescription =
      pendingInput.kind === 'add-description' || pendingInput.kind === 'edit-description';
    const maxLength = isDescription ? maxDescriptionLength : maxItemLength;

    if (!text) {
      await context.deleteMessage().catch(() => undefined);
      await showInputError(
        context.api,
        locale,
        pendingInput,
        translate(locale, isDescription ? 'daily.emptyDescription' : 'daily.emptyItem'),
      );
      return;
    }

    if (text.length > maxLength) {
      await context.deleteMessage().catch(() => undefined);
      await showInputError(
        context.api,
        locale,
        pendingInput,
        translate(locale, isDescription ? 'daily.descriptionTooLong' : 'daily.itemTooLong', {
          max: maxLength,
        }),
      );
      return;
    }

    await context.deleteMessage().catch(() => undefined);

    if (pendingInput.kind === 'add-title') {
      const promptText = renderDescriptionChoice(locale, text, pendingInput.date);
      const replyMarkup = buildDescriptionChoiceKeyboard(locale);
      const prompt = await context.api
        .editMessageText(pendingInput.prompt.chatId, pendingInput.prompt.messageId, promptText, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        })
        .then(() => pendingInput.prompt)
        .catch(async () =>
          messageReference(
            await context.reply(promptText, {
              parse_mode: 'HTML',
              reply_markup: replyMarkup,
            }),
          ),
        );
      state.pendingInput = {
        kind: 'add-description-choice',
        date: pendingInput.date,
        text,
        prompt,
      };
      releaseTextInput(state.ownerId, 'daily-plan');
      return;
    }

    if (pendingInput.kind === 'edit-title' || pendingInput.kind === 'edit-description') {
      const plan = await apiClient.updateDailyPlanItem(
        state.ownerId,
        pendingInput.date,
        pendingInput.itemId,
        {
          ...(pendingInput.kind === 'edit-description' ? { description: text } : { text }),
        },
      );
      const updatedItem = plan.items.find(candidate => candidate.id === pendingInput.itemId);

      state.pendingInput = null;
      releaseTextInput(state.ownerId, 'daily-plan');

      if (updatedItem) {
        await context.api.editMessageText(
          pendingInput.prompt.chatId,
          pendingInput.prompt.messageId,
          renderItemDetails(locale, plan, updatedItem),
          {
            parse_mode: 'HTML',
            reply_markup: buildItemDetailsKeyboard(locale, plan.date, updatedItem),
          },
        );
      } else {
        await context.api.editMessageText(
          pendingInput.prompt.chatId,
          pendingInput.prompt.messageId,
          renderManagement(plan),
          {
            parse_mode: 'HTML',
            reply_markup: buildManagementKeyboard(plan),
          },
        );
      }

      if (pendingInput.kind === 'edit-title') {
        await refreshPlanPanel(context.api, state, plan);
      }

      return;
    }

    const plan = await apiClient.addDailyPlanItem(
      state.ownerId,
      pendingInput.date,
      pendingInput.text,
      text,
    );

    state.pendingInput = null;
    releaseTextInput(state.ownerId, 'daily-plan');
    await context.api
      .deleteMessage(pendingInput.prompt.chatId, pendingInput.prompt.messageId)
      .catch(() => undefined);
    await showUpdatedPlan(context, state, plan);
  });
}

async function loadPlan(
  apiClient: AionApiClient,
  ownerId: number,
  date: string,
): Promise<v1.TelegramDailyPlanDto> {
  return apiClient.getOrCreateDailyPlan(ownerId, date);
}

async function showSelectedPlan(
  context: Context,
  state: DailyPlanInteractionState,
  plan: v1.TelegramDailyPlanDto,
): Promise<void> {
  const activePanel = state.activePanel;
  state.hideCompleted = false;

  if (activePanel) {
    const updated = await context.api
      .editMessageText(
        activePanel.chatId,
        activePanel.messageId,
        renderPlan(plan, state.hideCompleted),
        {
          parse_mode: 'HTML',
          reply_markup: buildPlanKeyboard(plan, state.hideCompleted),
        },
      )
      .then(() => true)
      .catch(error => isTelegramMessageNotModified(error));

    if (updated) {
      state.activePanel = { ...activePanel, date: plan.date };
      return;
    }
  }

  state.activePanel = null;
  await showUpdatedPlan(context, state, plan);
}

async function restoreItemPanel(
  context: Context,
  plan: v1.TelegramDailyPlanDto,
  itemId: string,
): Promise<void> {
  const locale = getLocale(Number(plan.telegramUserId));
  const item = plan.items.find(candidate => candidate.id === itemId);

  if (!item) {
    await context.editMessageText(renderManagement(plan), {
      parse_mode: 'HTML',
      reply_markup: buildManagementKeyboard(plan),
    });
    return;
  }

  await context.editMessageText(renderItemDetails(locale, plan, item), {
    parse_mode: 'HTML',
    reply_markup: buildItemDetailsKeyboard(locale, plan.date, item),
  });
}

async function showUpdatedPlan(
  context: Context,
  state: DailyPlanInteractionState,
  plan: v1.TelegramDailyPlanDto,
): Promise<void> {
  const panelUpdated = await refreshPlanPanel(context.api, state, plan);

  if (!panelUpdated) {
    const panel = await context.reply(renderPlan(plan, state.hideCompleted), {
      parse_mode: 'HTML',
      reply_markup: buildPlanKeyboard(plan, state.hideCompleted),
    });

    state.activePanel = datedMessageReference(panel, plan.date);
  }

  await refreshManagementMessage(context.api, state, plan);
}

async function showInputError(
  telegramApi: TelegramApi,
  locale: ReturnType<typeof getLocale>,
  pendingInput: Exclude<
    PendingInput,
    { kind: 'add-description-choice' } | { kind: 'select-date' } | { kind: 'move-date' }
  >,
  error: string,
): Promise<void> {
  const instruction =
    pendingInput.kind === 'add-title'
      ? translate(locale, 'daily.addPrompt', {
          date: formatPlanDate(pendingInput.date, locale),
          max: maxItemLength,
        })
      : pendingInput.kind === 'edit-title'
        ? translate(locale, 'daily.editPrompt', { max: maxItemLength })
        : translate(locale, 'daily.descriptionPrompt', { max: maxDescriptionLength });
  const datedInstruction = [
    translate(locale, 'daily.dateLabel', {
      date: formatPlanDate(pendingInput.date, locale),
    }),
    '',
    instruction,
  ].join('\n');
  const replyMarkup =
    pendingInput.kind === 'edit-description' || pendingInput.kind === 'edit-title'
      ? buildEditInputKeyboard(locale, pendingInput.currentValue)
      : buildCancelKeyboard(locale);
  const currentValue =
    (pendingInput.kind === 'edit-description' || pendingInput.kind === 'edit-title') &&
    pendingInput.currentValue
      ? `\n\n${renderCopyableText(pendingInput.currentValue)}`
      : '';

  await telegramApi.editMessageText(
    pendingInput.prompt.chatId,
    pendingInput.prompt.messageId,
    `${error}\n\n${datedInstruction}${currentValue}`,
    { parse_mode: 'HTML', reply_markup: replyMarkup },
  );
}

function acceptsTextInput(
  pendingInput: PendingInput,
): pendingInput is Exclude<PendingInput, { kind: 'add-description-choice' }> {
  return pendingInput.kind !== 'add-description-choice';
}

function isPromptCallback(pendingInput: PendingInput, messageId: number | undefined): boolean {
  return pendingInput.prompt.messageId === messageId;
}

async function prepareTransientSurface(
  telegramApi: TelegramApi,
  state: DailyPlanInteractionState,
): Promise<void> {
  await removePendingPrompt(telegramApi, state);
  await removeManagementMessage(telegramApi, state);
}

async function removePendingPrompt(
  telegramApi: TelegramApi,
  state: DailyPlanInteractionState,
): Promise<void> {
  const pendingInput = state.pendingInput;
  state.pendingInput = null;
  releaseTextInput(state.ownerId, 'daily-plan');

  if (!pendingInput) return;

  await telegramApi
    .deleteMessage(pendingInput.prompt.chatId, pendingInput.prompt.messageId)
    .catch(() => {
      // A deleted or outdated prompt does not affect the persisted plan.
    });
}

function removePendingInputWithoutDeleting(state: DailyPlanInteractionState): void {
  state.pendingInput = null;
  releaseTextInput(state.ownerId, 'daily-plan');
}

async function removeManagementMessage(
  telegramApi: TelegramApi,
  state: DailyPlanInteractionState,
): Promise<void> {
  const managementMessage = state.managementMessage;
  state.managementMessage = null;

  if (!managementMessage) return;

  await telegramApi
    .deleteMessage(managementMessage.chatId, managementMessage.messageId)
    .catch(() => {
      // The message may already have been removed manually.
    });
}

async function refreshPlanPanel(
  telegramApi: TelegramApi,
  state: DailyPlanInteractionState,
  plan: v1.TelegramDailyPlanDto,
): Promise<boolean> {
  const activePanel = state.activePanel;

  if (!activePanel || activePanel.date !== plan.date) return false;

  return telegramApi
    .editMessageText(
      activePanel.chatId,
      activePanel.messageId,
      renderPlan(plan, state.hideCompleted),
      {
        parse_mode: 'HTML',
        reply_markup: buildPlanKeyboard(plan, state.hideCompleted),
      },
    )
    .then(() => true)
    .catch(error => {
      if (isTelegramMessageNotModified(error)) return true;
      state.activePanel = null;
      return false;
    });
}

async function refreshManagementMessage(
  telegramApi: TelegramApi,
  state: DailyPlanInteractionState,
  plan: v1.TelegramDailyPlanDto,
): Promise<void> {
  const managementMessage = state.managementMessage;

  if (!managementMessage || managementMessage.date !== plan.date) return;

  await telegramApi
    .editMessageText(
      managementMessage.chatId,
      managementMessage.messageId,
      renderManagement(plan),
      {
        parse_mode: 'HTML',
        reply_markup: buildManagementKeyboard(plan),
      },
    )
    .catch(error => {
      if (isTelegramMessageNotModified(error)) return;
      state.managementMessage = null;
    });
}

function currentDateKey(): string {
  return currentKyivDateKey();
}

function renderDescriptionChoice(
  locale: ReturnType<typeof getLocale>,
  text: string,
  date: string,
): string {
  return [
    `<b>${translate(locale, 'daily.itemDraft')}</b>`,
    escapeHtml(text),
    '',
    translate(locale, 'daily.dateLabel', { date: formatPlanDate(date, locale) }),
    '',
    translate(locale, 'daily.descriptionChoice'),
  ].join('\n');
}

function renderDatePrompt(locale: ReturnType<typeof getLocale>, exampleDate: string): string {
  return translate(locale, 'daily.datePrompt', {
    example: formatDateKeyInput(exampleDate),
  });
}

function renderDescriptionEditPrompt(
  locale: ReturnType<typeof getLocale>,
  date: string,
  item: v1.TelegramDailyPlanItemDto,
): string {
  const description = item.description
    ? renderCopyableText(item.description)
    : `<i>${translate(locale, 'daily.noDescription')}</i>`;

  return [
    translate(locale, 'daily.dateLabel', { date: formatPlanDate(date, locale) }),
    '',
    `<b>${translate(locale, 'daily.titleLabel')}</b>`,
    escapeHtml(item.text),
    '',
    `<b>${translate(locale, 'daily.descriptionLabel')}</b>`,
    description,
    '',
    translate(locale, 'daily.descriptionPrompt', { max: maxDescriptionLength }),
  ].join('\n');
}

export function renderPlan(plan: v1.TelegramDailyPlanDto, hideCompleted = false): string {
  const locale = getLocale(Number(plan.telegramUserId));
  const date = formatPlanDate(plan.date, locale);
  const completedCount = plan.items.filter(item => item.completed).length;
  const itemLines = renderItemLines(plan, hideCompleted);
  const items =
    itemLines.length > 0
      ? itemLines.join('\n')
      : `<i>${translate(locale, hideCompleted ? 'daily.completedHidden' : 'daily.emptyPlan')}</i>`;

  return [
    `<b>${renderPlanTitle(plan.date, locale)}</b>`,
    `<i>${date}</i>`,
    '',
    items,
    '',
    `<code>${completedCount}/${plan.items.length}</code> ${translate(locale, 'daily.completed')}`,
    ...(isEditablePlanDate(plan.date) ? [] : ['', `<i>${translate(locale, 'daily.readOnly')}</i>`]),
  ].join('\n');
}

export function renderManagement(plan: v1.TelegramDailyPlanDto): string {
  const locale = getLocale(Number(plan.telegramUserId));
  const itemLines = renderManagementItemLines(plan);
  const items =
    itemLines.length > 0 ? itemLines.join('\n') : `<i>${translate(locale, 'daily.noItems')}</i>`;

  return [
    `<b>${translate(locale, 'daily.managementTitle')}</b>`,
    `<i>${formatPlanDate(plan.date, locale)}</i>`,
    translate(locale, 'daily.managementHint'),
    '',
    items,
  ].join('\n');
}

export function renderItemDetails(
  locale: ReturnType<typeof getLocale>,
  plan: v1.TelegramDailyPlanDto,
  item: v1.TelegramDailyPlanItemDto,
): string {
  const number = plan.items.findIndex(candidate => candidate.id === item.id) + 1;
  const description = item.description
    ? escapeHtml(item.description)
    : `<i>${translate(locale, 'daily.noDescription')}</i>`;

  return [
    `<b>${translate(locale, 'daily.itemDetailsTitle', { number })}</b>`,
    `<i>${formatPlanDate(plan.date, locale)}</i>`,
    '',
    `<b>${translate(locale, 'daily.titleLabel')}</b>`,
    escapeHtml(item.text),
    '',
    `<b>${translate(locale, 'daily.descriptionLabel')}</b>`,
    description,
  ].join('\n');
}

function renderManagementItemLines(plan: v1.TelegramDailyPlanDto): string[] {
  return plan.items.map((item, index) => {
    const marker = item.completed ? '✅' : '⬜️';
    const descriptionMarker = item.description ? ' 📝' : '';
    return `${marker} <b>${index + 1}.</b> ${escapeHtml(item.text)}${descriptionMarker}`;
  });
}

function renderItemLines(plan: v1.TelegramDailyPlanDto, hideCompleted: boolean): string[] {
  return plan.items.flatMap((item, index) => {
    if (hideCompleted && item.completed) return [];
    const marker = item.completed ? '✅' : '⬜️';
    return [`${marker} <b>${index + 1}.</b> ${escapeHtml(item.text)}`];
  });
}

export function buildPlanKeyboard(
  plan: v1.TelegramDailyPlanDto,
  hideCompleted = false,
): InlineKeyboard {
  const locale = getLocale(Number(plan.telegramUserId));
  const keyboard = new InlineKeyboard();
  const editable = isEditablePlanDate(plan.date);
  const visibleItems = plan.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !hideCompleted || !item.completed);

  for (const [visibleIndex, { item, index }] of visibleItems.entries()) {
    if (!editable) break;
    const marker = item.completed ? '✅' : '⬜️';
    keyboard.text(`${marker} ${index + 1}`, `dp:t:${plan.date}:${item.id}`);

    if ((visibleIndex + 1) % 5 === 0) keyboard.row();
  }

  if (editable && visibleItems.length % 5 !== 0) keyboard.row();

  if (editable) {
    keyboard.text(translate(locale, 'daily.add'), `dp:a:${plan.date}`);

    if (plan.items.length > 0) {
      keyboard.text(translate(locale, 'daily.manage'), `dp:m:${plan.date}`);
    }
  }

  const completedCount = plan.items.filter(item => item.completed).length;

  if (editable && completedCount > 0) {
    keyboard.row().text(
      translate(locale, hideCompleted ? 'daily.showCompleted' : 'daily.hideCompleted', {
        count: completedCount,
      }),
      hideCompleted ? `dp:s:${plan.date}` : `dp:h:${plan.date}`,
    );
  }

  if (editable) keyboard.row();

  return keyboard
    .text('◀️', `dp:o:${shiftDateKey(plan.date, -1)}`)
    .text(translate(locale, 'daily.today'), `dp:o:${currentDateKey()}`)
    .text('▶️', `dp:o:${shiftDateKey(plan.date, 1)}`)
    .row()
    .text(translate(locale, 'daily.chooseDate'), `dp:c:${plan.date}`);
}

function buildCancelKeyboard(locale: ReturnType<typeof getLocale>): InlineKeyboard {
  return new InlineKeyboard().text(translate(locale, 'daily.cancel'), 'daily-plan:cancel-input');
}

function buildDescriptionChoiceKeyboard(locale: ReturnType<typeof getLocale>): InlineKeyboard {
  return new InlineKeyboard()
    .text(translate(locale, 'daily.addDescription'), 'daily-plan:add-description')
    .text(translate(locale, 'daily.withoutDescription'), 'daily-plan:add-without-description')
    .row()
    .text(translate(locale, 'daily.cancel'), 'daily-plan:cancel-input');
}

function buildDateChoiceKeyboard(locale: ReturnType<typeof getLocale>): InlineKeyboard {
  const today = currentDateKey();
  return new InlineKeyboard()
    .text(translate(locale, 'daily.today'), `dp:p:${today}`)
    .text(translate(locale, 'daily.tomorrow'), `dp:p:${shiftDateKey(today, 1)}`)
    .row()
    .text(translate(locale, 'daily.inOneWeek'), `dp:p:${shiftDateKey(today, 7)}`)
    .row()
    .text(translate(locale, 'daily.cancel'), 'daily-plan:cancel-input');
}

function buildEditInputKeyboard(
  locale: ReturnType<typeof getLocale>,
  currentValue: string | null,
): InlineKeyboard {
  return addCopyCurrentTextButton(new InlineKeyboard(), locale, currentValue).text(
    translate(locale, 'daily.cancel'),
    'daily-plan:cancel-edit',
  );
}

function buildItemDetailsKeyboard(
  locale: ReturnType<typeof getLocale>,
  date: string,
  item: v1.TelegramDailyPlanItemDto,
): InlineKeyboard {
  if (!isEditablePlanDate(date)) {
    return new InlineKeyboard().text(translate(locale, 'daily.backToManagement'), `dp:ml:${date}`);
  }

  const keyboard = new InlineKeyboard()
    .text(translate(locale, 'daily.editTitle'), `dp:e:${date}:${item.id}`)
    .row()
    .text(translate(locale, 'daily.editDescription'), `dp:d:${date}:${item.id}`)
    .row();

  if (item.description) {
    keyboard.text(translate(locale, 'daily.clearDescription'), `dp:cd:${date}:${item.id}`).row();
  }

  if (!item.completed) {
    keyboard.text(translate(locale, 'daily.move'), `dp:mv:${date}:${item.id}`).row();
  }

  return keyboard
    .text(
      translate(locale, item.completed ? 'daily.markIncomplete' : 'daily.markCompleted'),
      `dp:mt:${date}:${item.id}`,
    )
    .row()
    .text(translate(locale, 'daily.delete'), `dp:x:${date}:${item.id}`)
    .row()
    .text(translate(locale, 'daily.backToManagement'), `dp:ml:${date}`);
}

function buildManagementKeyboard(plan: v1.TelegramDailyPlanDto): InlineKeyboard {
  const locale = getLocale(Number(plan.telegramUserId));
  const keyboard = new InlineKeyboard();

  if (isEditablePlanDate(plan.date)) {
    for (const [index, item] of plan.items.entries()) {
      keyboard.text(`⚙️ ${index + 1}`, `dp:i:${plan.date}:${item.id}`).row();
    }
  }

  return keyboard.text(translate(locale, 'daily.done'), 'daily-plan:management-done');
}

function requiredMatch(data: string, pattern: RegExp): RegExpExecArray {
  const match = pattern.exec(data);
  if (!match) throw new Error(`Unexpected daily plan callback: ${data}`);
  return match;
}

function parseItemCallback(data: string, pattern: RegExp): { date: string; itemId: string } {
  const match = requiredMatch(data, pattern);
  return {
    date: match[2] ?? currentDateKey(),
    itemId: match[3] ?? match[1]!,
  };
}

function formatPlanDate(date: string, locale: ReturnType<typeof getLocale>): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function renderPlanTitle(date: string, locale: ReturnType<typeof getLocale>): string {
  const today = currentDateKey();
  if (date === today) return translate(locale, 'daily.title');
  if (date === shiftDateKey(today, 1)) return translate(locale, 'daily.titleTomorrow');
  return translate(locale, 'daily.titleSelected');
}

function isEditablePlanDate(date: string): boolean {
  return date >= currentDateKey();
}

function stateForOwner(ownerId: number | undefined): DailyPlanInteractionState {
  if (!ownerId) {
    throw new Error('Telegram user ID is required for a daily plan');
  }

  const existingState = statesByOwnerId.get(ownerId);

  if (existingState) return existingState;

  const state: DailyPlanInteractionState = {
    ownerId,
    activePanel: null,
    managementMessage: null,
    pendingInput: null,
    hideCompleted: false,
  };

  statesByOwnerId.set(ownerId, state);
  return state;
}

function messageReference(message: { chat: { id: number }; message_id: number }): MessageReference {
  return {
    chatId: message.chat.id,
    messageId: message.message_id,
  };
}

function datedMessageReference(
  message: { chat: { id: number }; message_id: number },
  date: string,
): DatedMessageReference {
  return { ...messageReference(message), date };
}

export function setActiveDailyPlanPanel(
  userId: number,
  message: { chat: { id: number }; message_id: number },
  date = currentDateKey(),
): void {
  stateForOwner(userId).activePanel = datedMessageReference(message, date);
}

function requireApiClient(): AionApiClient {
  if (!registeredApiClient) {
    throw new Error('Daily plan API client is not registered');
  }

  return registeredApiClient;
}
