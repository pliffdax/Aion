import { v1 } from '@aion/contracts';

interface ResponseSchema<T> {
  parse(value: unknown): T;
}

export interface TelegramUserProfile {
  id: number;
  username?: string;
  firstName: string;
}

export class AionApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  upsertTelegramUser(user: TelegramUserProfile): Promise<v1.TelegramUserDto> {
    return this.request(
      '/telegram/users',
      v1.TelegramUserDtoSchema,
      'PUT',
      telegramUserPayload(user),
    );
  }

  updateTelegramUserLocale(
    telegramUserId: number,
    locale: v1.TelegramLocale,
  ): Promise<v1.TelegramUserDto> {
    return this.request('/telegram/users/locale', v1.TelegramUserDtoSchema, 'PATCH', {
      telegramUserId: String(telegramUserId),
      locale,
    });
  }

  updateTelegramUserReportProfile(
    telegramUserId: number,
    fields: Omit<v1.UpdateTelegramReportProfileDto, 'telegramUserId'>,
  ): Promise<v1.TelegramUserDto> {
    return this.request('/telegram/users/report-profile', v1.TelegramUserDtoSchema, 'PATCH', {
      telegramUserId: String(telegramUserId),
      ...fields,
    });
  }

  claimReportDelivery(
    telegramUserId: number,
    report: Omit<v1.ClaimTelegramReportDeliveryDto, 'telegramUserId'>,
  ): Promise<v1.ClaimedTelegramReportDeliveryDto> {
    return this.request(
      '/telegram/reports/delivery/claim',
      v1.ClaimedTelegramReportDeliveryDtoSchema,
      'POST',
      { telegramUserId: String(telegramUserId), ...report },
    );
  }

  completeReportDelivery(
    reportId: string,
    deliveryToken: string,
    telegramMessageId: number,
  ): Promise<v1.TelegramReportDeliveryResultDto> {
    return this.request(
      '/telegram/reports/delivery/complete',
      v1.TelegramReportDeliveryResultDtoSchema,
      'POST',
      { reportId, deliveryToken, telegramMessageId: String(telegramMessageId) },
    );
  }

  failReportDelivery(
    reportId: string,
    deliveryToken: string,
    error: string,
  ): Promise<v1.TelegramReportDeliveryResultDto> {
    return this.request(
      '/telegram/reports/delivery/fail',
      v1.TelegramReportDeliveryResultDtoSchema,
      'POST',
      { reportId, deliveryToken, error },
    );
  }

  listReportHistory(
    telegramUserId: number,
    filters: Omit<v1.ListTelegramReportHistoryDto, 'telegramUserId'> = { limit: 10 },
  ): Promise<v1.TelegramReportHistoryPageDto> {
    return this.request(
      '/telegram/reports/history',
      v1.TelegramReportHistoryPageDtoSchema,
      'POST',
      { telegramUserId: String(telegramUserId), ...filters },
    );
  }

  getReportHistoryItem(telegramUserId: number, reportId: string): Promise<v1.TelegramReportDto> {
    return this.request('/telegram/reports/history/item', v1.TelegramReportDtoSchema, 'POST', {
      telegramUserId: String(telegramUserId),
      reportId,
    });
  }

  findEditableReport(
    telegramUserId: number,
    report: Omit<v1.FindEditableTelegramReportDto, 'telegramUserId'>,
  ): Promise<v1.EditableTelegramReportDto | null> {
    return this.request(
      '/telegram/reports/editable/find',
      v1.NullableEditableTelegramReportDtoSchema,
      'POST',
      { telegramUserId: String(telegramUserId), ...report },
    );
  }

  replaceReport(
    telegramUserId: number,
    report: Omit<v1.ReplaceTelegramReportDto, 'telegramUserId'>,
  ): Promise<v1.EditableTelegramReportDto> {
    return this.request('/telegram/reports/editable', v1.EditableTelegramReportDtoSchema, 'PATCH', {
      telegramUserId: String(telegramUserId),
      ...report,
    });
  }

  getOrCreateDailyPlan(telegramUserId: number, date: string): Promise<v1.TelegramDailyPlanDto> {
    return this.request('/telegram/daily-plans', v1.TelegramDailyPlanDtoSchema, 'PUT', {
      telegramUserId: String(telegramUserId),
      date,
    });
  }

  addDailyPlanItem(
    telegramUserId: number,
    date: string,
    text: string,
    description?: string,
  ): Promise<v1.TelegramDailyPlanDto> {
    return this.request('/telegram/daily-plans/items', v1.TelegramDailyPlanDtoSchema, 'POST', {
      telegramUserId: String(telegramUserId),
      date,
      text,
      ...(description !== undefined ? { description } : {}),
    });
  }

  updateDailyPlanItem(
    telegramUserId: number,
    date: string,
    itemId: string,
    fields: { text?: string; description?: string | null; completed?: boolean },
  ): Promise<v1.TelegramDailyPlanDto> {
    return this.request('/telegram/daily-plans/items', v1.TelegramDailyPlanDtoSchema, 'PATCH', {
      telegramUserId: String(telegramUserId),
      date,
      itemId,
      ...fields,
    });
  }

  toggleDailyPlanItem(
    telegramUserId: number,
    date: string,
    itemId: string,
  ): Promise<v1.TelegramDailyPlanDto> {
    return this.request(
      '/telegram/daily-plans/items/toggle',
      v1.TelegramDailyPlanDtoSchema,
      'POST',
      {
        telegramUserId: String(telegramUserId),
        date,
        itemId,
      },
    );
  }

  deleteDailyPlanItem(
    telegramUserId: number,
    date: string,
    itemId: string,
  ): Promise<v1.TelegramDailyPlanDto> {
    return this.request('/telegram/daily-plans/items', v1.TelegramDailyPlanDtoSchema, 'DELETE', {
      telegramUserId: String(telegramUserId),
      date,
      itemId,
    });
  }

  moveDailyPlanItem(
    telegramUserId: number,
    date: string,
    itemId: string,
    targetDate: string,
  ): Promise<v1.MoveTelegramDailyPlanItemResultDto> {
    return this.request(
      '/telegram/daily-plans/items/move',
      v1.MoveTelegramDailyPlanItemResultDtoSchema,
      'POST',
      {
        telegramUserId: String(telegramUserId),
        date,
        itemId,
        targetDate,
      },
    );
  }

  clearCompletedDailyPlanItems(
    telegramUserId: number,
    date: string,
  ): Promise<v1.TelegramDailyPlanDto> {
    return this.request(
      '/telegram/daily-plans/completed',
      v1.TelegramDailyPlanDtoSchema,
      'DELETE',
      {
        telegramUserId: String(telegramUserId),
        date,
      },
    );
  }

  getWeeklyPlanStatistics(
    telegramUserId: number,
    periodStart: string,
  ): Promise<v1.TelegramWeeklyPlanStatisticsDto> {
    return this.request(
      '/telegram/daily-plans/statistics/weekly',
      v1.TelegramWeeklyPlanStatisticsDtoSchema,
      'POST',
      { telegramUserId: String(telegramUserId), periodStart },
    );
  }

  listWeeklyPlanStatisticsCandidates(
    periodStart: string,
    cursor: string | null = null,
    limit = 10,
  ): Promise<v1.TelegramWeeklyPlanStatisticsCandidatePageDto> {
    return this.request(
      '/telegram/daily-plans/statistics/weekly/candidates',
      v1.TelegramWeeklyPlanStatisticsCandidatePageDtoSchema,
      'POST',
      { periodStart, cursor, limit },
    );
  }

  createReminder(
    telegramUserId: number,
    chatId: number,
    text: string,
    remindAt: string,
    timezone: string,
    recurrence: v1.TelegramReminderRecurrence,
  ): Promise<v1.TelegramReminderDto> {
    return this.request('/telegram/reminders', v1.TelegramReminderDtoSchema, 'POST', {
      telegramUserId: String(telegramUserId),
      chatId: String(chatId),
      text,
      remindAt,
      timezone,
      recurrence,
    });
  }

  listReminders(telegramUserId: number): Promise<v1.TelegramReminderListDto> {
    return this.request('/telegram/reminders/list', v1.TelegramReminderListDtoSchema, 'POST', {
      telegramUserId: String(telegramUserId),
    });
  }

  cancelReminder(telegramUserId: number, reminderId: string): Promise<v1.TelegramReminderDto> {
    return this.request('/telegram/reminders', v1.TelegramReminderDtoSchema, 'DELETE', {
      telegramUserId: String(telegramUserId),
      reminderId,
    });
  }

  claimDueReminders(limit = 10): Promise<v1.ClaimedTelegramReminderListDto> {
    return this.request(
      '/telegram/reminders/delivery/claim',
      v1.ClaimedTelegramReminderListDtoSchema,
      'POST',
      { limit },
    );
  }

  completeReminderDelivery(
    reminderId: string,
    deliveryToken: string,
  ): Promise<v1.TelegramReminderDeliveryResultDto> {
    return this.request(
      '/telegram/reminders/delivery/complete',
      v1.TelegramReminderDeliveryResultDtoSchema,
      'POST',
      { reminderId, deliveryToken },
    );
  }

  failReminderDelivery(
    reminderId: string,
    deliveryToken: string,
    error: string,
  ): Promise<v1.TelegramReminderDeliveryResultDto> {
    return this.request(
      '/telegram/reminders/delivery/fail',
      v1.TelegramReminderDeliveryResultDtoSchema,
      'POST',
      { reminderId, deliveryToken, error },
    );
  }

  claimDailyPlanRollovers(
    sourceDate: string,
    targetDate: string,
    limit = 10,
  ): Promise<v1.ClaimedTelegramDailyPlanRolloverListDto> {
    return this.request(
      '/telegram/daily-plans/rollovers/claim',
      v1.ClaimedTelegramDailyPlanRolloverListDtoSchema,
      'POST',
      { sourceDate, targetDate, limit },
    );
  }

  completeDailyPlanRollover(
    sourcePlanId: string,
    deliveryToken: string,
  ): Promise<v1.TelegramReminderDeliveryResultDto> {
    return this.request(
      '/telegram/daily-plans/rollovers/complete',
      v1.TelegramReminderDeliveryResultDtoSchema,
      'POST',
      { sourcePlanId, deliveryToken },
    );
  }

  failDailyPlanRollover(
    sourcePlanId: string,
    deliveryToken: string,
    error: string,
  ): Promise<v1.TelegramReminderDeliveryResultDto> {
    return this.request(
      '/telegram/daily-plans/rollovers/fail',
      v1.TelegramReminderDeliveryResultDtoSchema,
      'POST',
      { sourcePlanId, deliveryToken, error },
    );
  }

  private async request<T>(
    path: string,
    schema: ResponseSchema<T>,
    method: 'PUT' | 'POST' | 'PATCH' | 'DELETE',
    body: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        [v1.ApiKeyHeaderName]: this.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `Aion API ${method} ${path} failed with ${response.status}: ${responseBody.slice(0, 500)}`,
      );
    }

    return schema.parse(await response.json());
  }
}

function telegramUserPayload(user: TelegramUserProfile): v1.UpsertTelegramUserDto {
  return {
    telegramUserId: String(user.id),
    username: user.username ?? null,
    firstName: user.firstName,
  };
}
