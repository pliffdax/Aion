import type { v1 } from '@aion/contracts';
import { Bot, InlineKeyboard, type Api as TelegramApi, type Context } from 'grammy';
import type { AionApiClient } from '../../core/api/aion-api-client.js';
import type { Command } from '../../core/commands/command.js';
import { escapeHtml } from '../../core/formatting/html.js';
import { dateLocale, getLocale, translate } from '../../core/i18n/i18n.js';
import {
  claimTextInput,
  ownsTextInput,
  releaseTextInput,
} from '../../core/interactions/text-input-owner.js';
import { currentKyivDateKey, kyivTimeZone } from '../../core/time/kyiv-calendar.js';

const timeZone = kyivTimeZone;
const maxItems = 20;
const maxItemLength = 160;
const maxDescriptionLength = 2000;
const toggleCallbackPattern = /^daily-plan:toggle:([^:]+)$/;
const manageItemCallbackPattern = /^daily-plan:(edit|description|delete):([^:]+)$/;
const confirmDeleteCallbackPattern = /^daily-plan:confirm-delete:([^:]+)$/;
const clearDescriptionCallbackPattern = /^daily-plan:clear-description:([^:]+)$/;

interface MessageReference {
  chatId: number;
  messageId: number;
}

type PendingInput =
  | { kind: 'add-title'; prompt: MessageReference }
  | { kind: 'add-description-choice'; text: string; prompt: MessageReference }
  | { kind: 'add-description'; text: string; prompt: MessageReference }
  | { kind: 'edit-title'; itemId: string; prompt: MessageReference }
  | {
      kind: 'edit-description';
      itemId: string;
      hasDescription: boolean;
      prompt: MessageReference;
    };

interface DailyPlanInteractionState {
  ownerId: number;
  activePanel: MessageReference | null;
  managementMessage: MessageReference | null;
  pendingInput: PendingInput | null;
}

const statesByOwnerId = new Map<number, DailyPlanInteractionState>();

export const command: Command = {
  name: 'plan',
  descriptionKey: 'command.plan.description',
  access: 'user',
  async handle(context) {
    const state = stateForOwner(context.from?.id);
    const apiClient = requireApiClient();
    const plan = await loadTodayPlan(apiClient, state.ownerId);

    await prepareTransientSurface(context.api, state);

    const panel = await context.reply(renderPlan(plan), {
      parse_mode: 'HTML',
      reply_markup: buildPlanKeyboard(plan),
    });

    state.activePanel = messageReference(panel);
  },
};

let registeredApiClient: AionApiClient | null = null;

export function registerDailyPlanHandlers(bot: Bot, apiClient: AionApiClient): void {
  registeredApiClient = apiClient;

  bot.callbackQuery('daily-plan:add', async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const plan = await loadTodayPlan(apiClient, state.ownerId);
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

    state.activePanel = messageReference(panelMessage);
    await removePendingPrompt(context.api, state);

    const prompt = await context.reply(translate(locale, 'daily.addPrompt'), {
      reply_markup: new InlineKeyboard().text(
        translate(locale, 'daily.cancel'),
        'daily-plan:cancel-input',
      ),
    });

    state.pendingInput = {
      kind: 'add-title',
      prompt: messageReference(prompt),
    };
    claimTextInput(state.ownerId, 'daily-plan');
  });

  bot.callbackQuery('daily-plan:manage', async context => {
    const state = stateForOwner(context.from.id);
    const plan = await loadTodayPlan(apiClient, state.ownerId);
    await prepareTransientSurface(context.api, state);
    await context.answerCallbackQuery();

    const panelMessage = context.callbackQuery.message;

    if (!panelMessage) return;

    state.activePanel = messageReference(panelMessage);

    const managementMessage = await context.reply(renderManagement(plan), {
      parse_mode: 'HTML',
      reply_markup: buildManagementKeyboard(plan),
    });

    state.managementMessage = messageReference(managementMessage);
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

    state.pendingInput = {
      kind: 'add-description',
      text: pendingInput.text,
      prompt: pendingInput.prompt,
    };
    claimTextInput(state.ownerId, 'daily-plan');
    await context.answerCallbackQuery();
    await context.editMessageText(
      translate(locale, 'daily.descriptionPrompt', { max: maxDescriptionLength }),
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

    const plan = await apiClient.addDailyPlanItem(
      state.ownerId,
      currentDateKey(),
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
    let plan = await loadTodayPlan(apiClient, state.ownerId);
    await context.answerCallbackQuery();

    const item = findItemFromCallback(plan, context.callbackQuery.data, toggleCallbackPattern);

    if (item) {
      plan = await apiClient.toggleDailyPlanItem(state.ownerId, plan.date, item.id);
    }

    const panelMessage = context.callbackQuery.message;

    if (panelMessage) {
      state.activePanel = messageReference(panelMessage);
    }

    await context.editMessageText(renderPlan(plan), {
      parse_mode: 'HTML',
      reply_markup: buildPlanKeyboard(plan),
    });
    await refreshManagementMessage(context.api, state, plan);
  });

  bot.callbackQuery('daily-plan:clear-completed', async context => {
    const state = stateForOwner(context.from.id);
    const plan = await apiClient.clearCompletedDailyPlanItems(state.ownerId, currentDateKey());
    await context.answerCallbackQuery();

    await context.editMessageText(renderPlan(plan), {
      parse_mode: 'HTML',
      reply_markup: buildPlanKeyboard(plan),
    });
    await refreshManagementMessage(context.api, state, plan);
  });

  bot.callbackQuery(manageItemCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    const plan = await loadTodayPlan(apiClient, state.ownerId);
    await context.answerCallbackQuery();

    const match = manageItemCallbackPattern.exec(context.callbackQuery.data);
    const action = match?.[1];
    const itemId = match?.[2];
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
            .text(translate(locale, 'daily.delete'), `daily-plan:confirm-delete:${item.id}`)
            .text(translate(locale, 'daily.cancel'), 'daily-plan:cancel-delete'),
        },
      );
      return;
    }

    await removePendingPrompt(context.api, state);

    if (action === 'description') {
      const prompt = await context.reply(renderDescriptionEditPrompt(locale, item), {
        parse_mode: 'HTML',
        reply_markup: buildDescriptionInputKeyboard(locale, item.id, item.description !== null),
      });

      state.pendingInput = {
        kind: 'edit-description',
        itemId: item.id,
        hasDescription: item.description !== null,
        prompt: messageReference(prompt),
      };
      claimTextInput(state.ownerId, 'daily-plan');
      return;
    }

    const prompt = await context.reply(
      `${translate(locale, 'daily.editPrompt')}\n\n${escapeHtml(item.text)}`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text(
          translate(locale, 'daily.cancel'),
          'daily-plan:cancel-input',
        ),
      },
    );

    state.pendingInput = {
      kind: 'edit-title',
      itemId: item.id,
      prompt: messageReference(prompt),
    };
    claimTextInput(state.ownerId, 'daily-plan');
  });

  bot.callbackQuery(confirmDeleteCallbackPattern, async context => {
    const state = stateForOwner(context.from.id);
    const locale = getLocale(state.ownerId);
    let plan = await loadTodayPlan(apiClient, state.ownerId);
    const item = findItemFromCallback(
      plan,
      context.callbackQuery.data,
      confirmDeleteCallbackPattern,
    );

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
    const pendingInput = state.pendingInput;
    const itemId = clearDescriptionCallbackPattern.exec(context.callbackQuery.data)?.[1];

    if (
      pendingInput?.kind !== 'edit-description' ||
      pendingInput.itemId !== itemId ||
      !isPromptCallback(pendingInput, context.callbackQuery.message?.message_id)
    ) {
      await context.answerCallbackQuery(translate(locale, 'daily.actionExpired'));
      return;
    }

    const plan = await apiClient.updateDailyPlanItem(
      state.ownerId,
      currentDateKey(),
      pendingInput.itemId,
      { description: null },
    );
    state.pendingInput = null;
    releaseTextInput(state.ownerId, 'daily-plan');
    await context.answerCallbackQuery(translate(locale, 'daily.descriptionCleared'));
    await context.deleteMessage().catch(() => undefined);
    await showUpdatedPlan(context, state, plan);
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
      const promptText = renderDescriptionChoice(locale, text);
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
        text,
        prompt,
      };
      releaseTextInput(state.ownerId, 'daily-plan');
      return;
    }

    const date = currentDateKey();
    const plan =
      pendingInput.kind === 'add-description'
        ? await apiClient.addDailyPlanItem(state.ownerId, date, pendingInput.text, text)
        : await apiClient.updateDailyPlanItem(state.ownerId, date, pendingInput.itemId, {
            ...(pendingInput.kind === 'edit-description' ? { description: text } : { text }),
          });

    state.pendingInput = null;
    releaseTextInput(state.ownerId, 'daily-plan');
    await context.api
      .deleteMessage(pendingInput.prompt.chatId, pendingInput.prompt.messageId)
      .catch(() => undefined);
    await showUpdatedPlan(context, state, plan);
  });
}

async function loadTodayPlan(
  apiClient: AionApiClient,
  ownerId: number,
): Promise<v1.TelegramDailyPlanDto> {
  return apiClient.getOrCreateDailyPlan(ownerId, currentDateKey());
}

async function showUpdatedPlan(
  context: Context,
  state: DailyPlanInteractionState,
  plan: v1.TelegramDailyPlanDto,
): Promise<void> {
  const panelUpdated = await refreshPlanPanel(context.api, state, plan);

  if (!panelUpdated) {
    const panel = await context.reply(renderPlan(plan), {
      parse_mode: 'HTML',
      reply_markup: buildPlanKeyboard(plan),
    });

    state.activePanel = messageReference(panel);
  }

  await refreshManagementMessage(context.api, state, plan);
}

async function showInputError(
  telegramApi: TelegramApi,
  locale: ReturnType<typeof getLocale>,
  pendingInput: Exclude<PendingInput, { kind: 'add-description-choice' }>,
  error: string,
): Promise<void> {
  const instruction =
    pendingInput.kind === 'add-title'
      ? translate(locale, 'daily.addPrompt')
      : pendingInput.kind === 'edit-title'
        ? translate(locale, 'daily.editPrompt')
        : translate(locale, 'daily.descriptionPrompt', { max: maxDescriptionLength });
  const replyMarkup =
    pendingInput.kind === 'edit-description'
      ? buildDescriptionInputKeyboard(locale, pendingInput.itemId, pendingInput.hasDescription)
      : buildCancelKeyboard(locale);

  await telegramApi.editMessageText(
    pendingInput.prompt.chatId,
    pendingInput.prompt.messageId,
    `${error}\n\n${instruction}`,
    { reply_markup: replyMarkup },
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

  if (!activePanel) return false;

  return telegramApi
    .editMessageText(activePanel.chatId, activePanel.messageId, renderPlan(plan), {
      parse_mode: 'HTML',
      reply_markup: buildPlanKeyboard(plan),
    })
    .then(() => true)
    .catch(() => {
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

  if (!managementMessage) return;

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
    .catch(() => {
      state.managementMessage = null;
    });
}

function currentDateKey(): string {
  return currentKyivDateKey();
}

function renderDescriptionChoice(locale: ReturnType<typeof getLocale>, text: string): string {
  return [
    `<b>${translate(locale, 'daily.itemDraft')}</b>`,
    escapeHtml(text),
    '',
    translate(locale, 'daily.descriptionChoice'),
  ].join('\n');
}

function renderDescriptionEditPrompt(
  locale: ReturnType<typeof getLocale>,
  item: v1.TelegramDailyPlanItemDto,
): string {
  const description = item.description
    ? escapeHtml(item.description)
    : `<i>${translate(locale, 'daily.noDescription')}</i>`;

  return [
    `<b>${translate(locale, 'daily.itemLabel')}</b>`,
    escapeHtml(item.text),
    '',
    `<b>${translate(locale, 'daily.descriptionLabel')}</b>`,
    description,
    '',
    translate(locale, 'daily.descriptionPrompt', { max: maxDescriptionLength }),
  ].join('\n');
}

export function renderPlan(plan: v1.TelegramDailyPlanDto): string {
  const locale = getLocale(Number(plan.telegramUserId));
  const date = new Intl.DateTimeFormat(dateLocale(locale), {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${plan.date}T00:00:00.000Z`));
  const completedCount = plan.items.filter(item => item.completed).length;
  const itemLines = renderItemLines(plan);
  const items =
    itemLines.length > 0 ? itemLines.join('\n') : `<i>${translate(locale, 'daily.emptyPlan')}</i>`;

  return [
    `<b>${translate(locale, 'daily.title')}</b>`,
    `<i>${date}</i>`,
    '',
    items,
    '',
    `<code>${completedCount}/${plan.items.length}</code> ${translate(locale, 'daily.completed')}`,
  ].join('\n');
}

export function renderManagement(plan: v1.TelegramDailyPlanDto): string {
  const locale = getLocale(Number(plan.telegramUserId));
  const itemLines = renderManagementItemLines(plan);
  const items =
    itemLines.length > 0 ? itemLines.join('\n') : `<i>${translate(locale, 'daily.noItems')}</i>`;

  return [`<b>${translate(locale, 'daily.managementTitle')}</b>`, '', items].join('\n');
}

function renderManagementItemLines(plan: v1.TelegramDailyPlanDto): string[] {
  return plan.items.map((item, index) => {
    const marker = item.completed ? '✅' : '⬜️';
    const descriptionMarker = item.description ? ' 📝' : '';
    return `${marker} <b>${index + 1}.</b> ${escapeHtml(item.text)}${descriptionMarker}`;
  });
}

function renderItemLines(plan: v1.TelegramDailyPlanDto): string[] {
  return plan.items.map((item, index) => {
    const marker = item.completed ? '✅' : '⬜️';
    return `${marker} <b>${index + 1}.</b> ${escapeHtml(item.text)}`;
  });
}

export function buildPlanKeyboard(plan: v1.TelegramDailyPlanDto): InlineKeyboard {
  const locale = getLocale(Number(plan.telegramUserId));
  const keyboard = new InlineKeyboard();

  for (const [index, item] of plan.items.entries()) {
    const marker = item.completed ? '✅' : '⬜️';
    keyboard.text(`${marker} ${index + 1}`, `daily-plan:toggle:${item.id}`);

    if ((index + 1) % 5 === 0) keyboard.row();
  }

  if (plan.items.length % 5 !== 0) keyboard.row();

  keyboard.text(translate(locale, 'daily.add'), 'daily-plan:add');

  if (plan.items.length > 0) {
    keyboard.text(translate(locale, 'daily.manage'), 'daily-plan:manage');
  }

  if (plan.items.some(item => item.completed)) {
    keyboard.row().text(translate(locale, 'daily.clearCompleted'), 'daily-plan:clear-completed');
  }

  return keyboard;
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

function buildDescriptionInputKeyboard(
  locale: ReturnType<typeof getLocale>,
  itemId: string,
  hasDescription: boolean,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (hasDescription) {
    keyboard
      .text(translate(locale, 'daily.clearDescription'), `daily-plan:clear-description:${itemId}`)
      .row();
  }

  return keyboard.text(translate(locale, 'daily.cancel'), 'daily-plan:cancel-input');
}

function buildManagementKeyboard(plan: v1.TelegramDailyPlanDto): InlineKeyboard {
  const locale = getLocale(Number(plan.telegramUserId));
  const keyboard = new InlineKeyboard();

  for (const [index, item] of plan.items.entries()) {
    keyboard
      .text(`✏️ ${index + 1}`, `daily-plan:edit:${item.id}`)
      .text(`📝 ${index + 1}`, `daily-plan:description:${item.id}`)
      .text(`🗑 ${index + 1}`, `daily-plan:delete:${item.id}`)
      .row();
  }

  return keyboard.text(translate(locale, 'daily.done'), 'daily-plan:management-done');
}

function findItemFromCallback(
  plan: v1.TelegramDailyPlanDto,
  data: string,
  pattern: RegExp,
): v1.TelegramDailyPlanItemDto | undefined {
  const itemId = pattern.exec(data)?.[1];
  return plan.items.find(item => item.id === itemId);
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

export function setActiveDailyPlanPanel(
  userId: number,
  message: { chat: { id: number }; message_id: number },
): void {
  stateForOwner(userId).activePanel = messageReference(message);
}

function requireApiClient(): AionApiClient {
  if (!registeredApiClient) {
    throw new Error('Daily plan API client is not registered');
  }

  return registeredApiClient;
}
