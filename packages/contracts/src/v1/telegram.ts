import { z } from 'zod';
import { CuidSchema } from './shared';

export const TelegramLocaleSchema = z.enum(['ru', 'uk', 'en']);
export type TelegramLocale = z.infer<typeof TelegramLocaleSchema>;

export const TelegramReportFieldInputTypeSchema = z.enum(['text', 'list', 'rating', 'boolean']);
export type TelegramReportFieldInputType = z.infer<typeof TelegramReportFieldInputTypeSchema>;

export const TelegramReportListStyleSchema = z.enum(['dash', 'numbered', 'status']);
export type TelegramReportListStyle = z.infer<typeof TelegramReportListStyleSchema>;

export const TelegramReportFieldSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
    title: z.string().trim().min(1).max(80),
    prompt: z.string().trim().max(240),
    inputType: TelegramReportFieldInputTypeSchema,
    listStyle: TelegramReportListStyleSchema.nullable(),
    required: z.boolean(),
  })
  .superRefine((field, context) => {
    if (field.inputType === 'list' && field.listStyle === null) {
      context.addIssue({
        code: 'custom',
        path: ['listStyle'],
        message: 'List fields require a list style',
      });
    }

    if (field.inputType !== 'list' && field.listStyle !== null) {
      context.addIssue({
        code: 'custom',
        path: ['listStyle'],
        message: 'Only list fields can have a list style',
      });
    }
  });
export type TelegramReportField = z.infer<typeof TelegramReportFieldSchema>;

export const DefaultTelegramDailyReportSections: TelegramReportField[] = [
  {
    id: 'daily-priorities',
    title: 'Приоритет дня',
    prompt: 'Добавьте приоритеты дня и отметьте их статус.',
    inputType: 'list',
    listStyle: 'status',
    required: true,
  },
  {
    id: 'daily-event',
    title: 'Событие дня',
    prompt: 'Опишите главное событие дня.',
    inputType: 'text',
    listStyle: null,
    required: true,
  },
  {
    id: 'daily-conclusion',
    title: 'Вывод дня',
    prompt: 'Напишите основной вывод дня.',
    inputType: 'text',
    listStyle: null,
    required: true,
  },
  {
    id: 'daily-tomorrow',
    title: 'Главные задачи на завтра',
    prompt: 'Добавьте задачи на следующий день.',
    inputType: 'list',
    listStyle: 'dash',
    required: true,
  },
  {
    id: 'daily-rating',
    title: 'Счастье',
    prompt: 'Оцените день от 1 до 10.',
    inputType: 'rating',
    listStyle: null,
    required: true,
  },
];

export const DefaultTelegramWeeklyReportSections: TelegramReportField[] = [
  {
    id: 'weekly-wins',
    title: 'Победы недели',
    prompt: 'Перечислите победы недели.',
    inputType: 'list',
    listStyle: 'numbered',
    required: true,
  },
  {
    id: 'weekly-failure',
    title: 'Провал недели',
    prompt: 'Опишите главный провал недели.',
    inputType: 'text',
    listStyle: null,
    required: true,
  },
  {
    id: 'weekly-insight',
    title: 'Инсайт недели',
    prompt: 'Запишите главный инсайт недели.',
    inputType: 'text',
    listStyle: null,
    required: true,
  },
  {
    id: 'weekly-next',
    title: 'План на следующую неделю',
    prompt: 'Перечислите задачи следующей недели.',
    inputType: 'list',
    listStyle: 'numbered',
    required: true,
  },
  {
    id: 'weekly-review',
    title: 'Прошу на разбор',
    prompt: 'Нужно ли разобрать этот отчёт?',
    inputType: 'boolean',
    listStyle: null,
    required: true,
  },
];

function uniqueReportFields(fields: TelegramReportField[]): boolean {
  return new Set(fields.map(field => field.id)).size === fields.length;
}

export const TelegramReportSectionsSchema = z
  .array(TelegramReportFieldSchema)
  .min(1)
  .max(12)
  .refine(uniqueReportFields, { message: 'Report field IDs must be unique' });

export const TelegramDailyReportSectionsSchema = TelegramReportSectionsSchema;
export const TelegramWeeklyReportSectionsSchema = TelegramReportSectionsSchema;

const maxPostgresBigInt = 9_223_372_036_854_775_807n;

export const TelegramUserIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine(value => BigInt(value) <= maxPostgresBigInt, {
    message: 'Telegram user ID exceeds the supported range',
  });
export const TelegramPlanDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    value => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    },
    {
      message: 'Invalid calendar date',
    },
  );

export const TelegramUserDtoSchema = z.object({
  id: CuidSchema,
  telegramUserId: TelegramUserIdSchema,
  username: z.string().max(32).nullable(),
  firstName: z.string().max(64).nullable(),
  locale: TelegramLocaleSchema,
  reportAuthorName: z.string().max(100).nullable(),
  reportStartDate: TelegramPlanDateSchema.nullable(),
  reportDailySections: TelegramDailyReportSectionsSchema,
  reportWeeklySections: TelegramWeeklyReportSectionsSchema,
});
export type TelegramUserDto = z.infer<typeof TelegramUserDtoSchema>;

export const UpsertTelegramUserDtoSchema = z.object({
  telegramUserId: TelegramUserIdSchema,
  username: z.string().max(32).nullable().optional(),
  firstName: z.string().max(64).nullable().optional(),
});
export type UpsertTelegramUserDto = z.infer<typeof UpsertTelegramUserDtoSchema>;

export const UpdateTelegramUserLocaleDtoSchema = z.object({
  telegramUserId: TelegramUserIdSchema,
  locale: TelegramLocaleSchema,
});
export type UpdateTelegramUserLocaleDto = z.infer<typeof UpdateTelegramUserLocaleDtoSchema>;

export const UpdateTelegramReportProfileDtoSchema = z
  .object({
    telegramUserId: TelegramUserIdSchema,
    reportAuthorName: z.string().trim().min(3).max(100).optional(),
    reportStartDate: TelegramPlanDateSchema.optional(),
    reportDailySections: TelegramDailyReportSectionsSchema.optional(),
    reportWeeklySections: TelegramWeeklyReportSectionsSchema.optional(),
  })
  .refine(
    dto =>
      dto.reportAuthorName !== undefined ||
      dto.reportStartDate !== undefined ||
      dto.reportDailySections !== undefined ||
      dto.reportWeeklySections !== undefined,
    {
      message: 'At least one report profile field must be provided',
    },
  );
export type UpdateTelegramReportProfileDto = z.infer<typeof UpdateTelegramReportProfileDtoSchema>;

export const TelegramReportTypeSchema = z.enum(['daily', 'weekly', 'weekly_statistics']);
export type TelegramReportType = z.infer<typeof TelegramReportTypeSchema>;

const TelegramReportTextSchema = z.string().min(1).max(4096);
const TelegramReportTimestampSchema = z.string().datetime({ offset: true });

export const TelegramReportAnswerItemSchema = z.object({
  id: z.number().int().positive(),
  text: z.string().trim().min(1).max(160),
  status: z.enum(['pending', 'completed', 'failed']),
});
export type TelegramReportAnswerItem = z.infer<typeof TelegramReportAnswerItemSchema>;

export const TelegramReportFieldAnswerSchema = z.object({
  text: z.string().max(800),
  items: z.array(TelegramReportAnswerItemSchema).max(20),
  rating: z.number().int().min(1).max(10).nullable(),
  boolean: z.boolean().nullable(),
});
export type TelegramReportFieldAnswer = z.infer<typeof TelegramReportFieldAnswerSchema>;

export const TelegramReportAnswersSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  TelegramReportFieldAnswerSchema,
);
export type TelegramReportAnswers = z.infer<typeof TelegramReportAnswersSchema>;

export const TelegramReportDtoSchema = z.object({
  id: CuidSchema,
  telegramUserId: TelegramUserIdSchema,
  type: TelegramReportTypeSchema,
  periodStart: TelegramPlanDateSchema,
  periodEnd: TelegramPlanDateSchema,
  text: TelegramReportTextSchema,
  createdAt: TelegramReportTimestampSchema,
  sentAt: TelegramReportTimestampSchema,
});
export type TelegramReportDto = z.infer<typeof TelegramReportDtoSchema>;

export const ClaimTelegramReportDeliveryDtoSchema = z
  .object({
    telegramUserId: TelegramUserIdSchema,
    type: TelegramReportTypeSchema,
    periodStart: TelegramPlanDateSchema,
    periodEnd: TelegramPlanDateSchema,
    text: TelegramReportTextSchema,
    answers: TelegramReportAnswersSchema.optional(),
    configuration: TelegramReportSectionsSchema.optional(),
  })
  .superRefine((report, context) => {
    validateTelegramReportPeriod(report, context);
    if ((report.answers === undefined) !== (report.configuration === undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['answers'],
        message: 'Report answers and configuration must be provided together',
      });
    }
  });
export type ClaimTelegramReportDeliveryDto = z.infer<typeof ClaimTelegramReportDeliveryDtoSchema>;

export const ClaimedTelegramReportDeliveryDtoSchema = z.discriminatedUnion('outcome', [
  z.object({
    reportId: CuidSchema,
    outcome: z.literal('claimed'),
    deliveryToken: z.string().uuid(),
  }),
  z.object({
    reportId: CuidSchema,
    outcome: z.literal('already_sent'),
    deliveryToken: z.null(),
  }),
  z.object({
    reportId: CuidSchema,
    outcome: z.literal('busy'),
    deliveryToken: z.null(),
  }),
]);
export type ClaimedTelegramReportDeliveryDto = z.infer<
  typeof ClaimedTelegramReportDeliveryDtoSchema
>;

export const CompleteTelegramReportDeliveryDtoSchema = z.object({
  reportId: CuidSchema,
  deliveryToken: z.string().uuid(),
  telegramMessageId: TelegramUserIdSchema,
});
export type CompleteTelegramReportDeliveryDto = z.infer<
  typeof CompleteTelegramReportDeliveryDtoSchema
>;

export const FailTelegramReportDeliveryDtoSchema = z.object({
  reportId: CuidSchema,
  deliveryToken: z.string().uuid(),
  error: z.string().trim().min(1).max(500),
});
export type FailTelegramReportDeliveryDto = z.infer<typeof FailTelegramReportDeliveryDtoSchema>;

export const TelegramReportDeliveryResultDtoSchema = z.object({ ok: z.literal(true) });
export type TelegramReportDeliveryResultDto = z.infer<typeof TelegramReportDeliveryResultDtoSchema>;

export const ListTelegramReportHistoryDtoSchema = z
  .object({
    telegramUserId: TelegramUserIdSchema,
    type: TelegramReportTypeSchema.optional(),
    periodFrom: TelegramPlanDateSchema.optional(),
    periodTo: TelegramPlanDateSchema.optional(),
    cursor: CuidSchema.nullable().optional(),
    limit: z.number().int().min(1).max(20).default(10),
  })
  .refine(
    value =>
      !value.periodFrom ||
      !value.periodTo ||
      Date.parse(value.periodFrom) <= Date.parse(value.periodTo),
    { message: 'periodFrom must be on or before periodTo', path: ['periodTo'] },
  );
export type ListTelegramReportHistoryDto = z.infer<typeof ListTelegramReportHistoryDtoSchema>;

export const TelegramReportHistoryPageDtoSchema = z.object({
  items: z.array(TelegramReportDtoSchema),
  nextCursor: CuidSchema.nullable(),
});
export type TelegramReportHistoryPageDto = z.infer<typeof TelegramReportHistoryPageDtoSchema>;

export const GetTelegramReportHistoryItemDtoSchema = z.object({
  telegramUserId: TelegramUserIdSchema,
  reportId: CuidSchema,
});
export type GetTelegramReportHistoryItemDto = z.infer<typeof GetTelegramReportHistoryItemDtoSchema>;

export const FindEditableTelegramReportDtoSchema = z
  .object({
    telegramUserId: TelegramUserIdSchema,
    type: z.enum(['daily', 'weekly']),
    periodStart: TelegramPlanDateSchema,
    periodEnd: TelegramPlanDateSchema,
  })
  .superRefine(validateTelegramReportPeriod);
export type FindEditableTelegramReportDto = z.infer<typeof FindEditableTelegramReportDtoSchema>;

export const EditableTelegramReportDtoSchema = TelegramReportDtoSchema.extend({
  answers: TelegramReportAnswersSchema.nullable(),
  configuration: TelegramReportSectionsSchema.nullable(),
  revision: z.number().int().positive(),
  telegramMessageId: TelegramUserIdSchema.nullable(),
});
export type EditableTelegramReportDto = z.infer<typeof EditableTelegramReportDtoSchema>;

export const NullableEditableTelegramReportDtoSchema = EditableTelegramReportDtoSchema.nullable();

export const ReplaceTelegramReportDtoSchema = z.object({
  telegramUserId: TelegramUserIdSchema,
  reportId: CuidSchema,
  expectedRevision: z.number().int().positive(),
  text: TelegramReportTextSchema,
  answers: TelegramReportAnswersSchema,
  configuration: TelegramReportSectionsSchema,
  telegramMessageId: TelegramUserIdSchema,
});
export type ReplaceTelegramReportDto = z.infer<typeof ReplaceTelegramReportDtoSchema>;

const TelegramDailyPlanItemDescriptionSchema = z.string().trim().min(1).max(2000);

export const TelegramDailyPlanItemDtoSchema = z.object({
  id: CuidSchema,
  text: z.string().min(1).max(160),
  description: TelegramDailyPlanItemDescriptionSchema.nullable().default(null),
  completed: z.boolean(),
  completedAt: z.string().datetime({ offset: true }).nullable().default(null),
  carryCount: z.number().int().min(0).default(0),
  position: z.number().int().min(0),
});
export type TelegramDailyPlanItemDto = z.infer<typeof TelegramDailyPlanItemDtoSchema>;

export const TelegramDailyPlanDtoSchema = z.object({
  id: CuidSchema,
  telegramUserId: TelegramUserIdSchema,
  date: TelegramPlanDateSchema,
  items: z.array(TelegramDailyPlanItemDtoSchema),
});
export type TelegramDailyPlanDto = z.infer<typeof TelegramDailyPlanDtoSchema>;

export const TelegramWeeklyPlanStatisticItemDtoSchema = z.object({
  text: z.string().min(1).max(160),
  carryCount: z.number().int().min(1),
  completed: z.boolean(),
});
export type TelegramWeeklyPlanStatisticItemDto = z.infer<
  typeof TelegramWeeklyPlanStatisticItemDtoSchema
>;

export const TelegramWeeklyPlanStatisticsDtoSchema = z.object({
  telegramUserId: TelegramUserIdSchema,
  locale: TelegramLocaleSchema,
  periodStart: TelegramPlanDateSchema,
  periodEnd: TelegramPlanDateSchema,
  taskCount: z.number().int().min(0),
  completedCount: z.number().int().min(0),
  unfinishedCount: z.number().int().min(0),
  carryEventCount: z.number().int().min(0),
  completionRate: z.number().int().min(0).max(100),
  mostCarriedItems: z.array(TelegramWeeklyPlanStatisticItemDtoSchema).max(5),
});
export type TelegramWeeklyPlanStatisticsDto = z.infer<typeof TelegramWeeklyPlanStatisticsDtoSchema>;

export const GetTelegramWeeklyPlanStatisticsDtoSchema = z.object({
  telegramUserId: TelegramUserIdSchema,
  periodStart: TelegramPlanDateSchema,
});
export type GetTelegramWeeklyPlanStatisticsDto = z.infer<
  typeof GetTelegramWeeklyPlanStatisticsDtoSchema
>;

export const ListTelegramWeeklyPlanStatisticsCandidatesDtoSchema = z.object({
  periodStart: TelegramPlanDateSchema,
  cursor: CuidSchema.nullable().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});
export type ListTelegramWeeklyPlanStatisticsCandidatesDto = z.infer<
  typeof ListTelegramWeeklyPlanStatisticsCandidatesDtoSchema
>;

export const TelegramWeeklyPlanStatisticsCandidatePageDtoSchema = z.object({
  items: z.array(TelegramWeeklyPlanStatisticsDtoSchema),
  nextCursor: CuidSchema.nullable(),
});
export type TelegramWeeklyPlanStatisticsCandidatePageDto = z.infer<
  typeof TelegramWeeklyPlanStatisticsCandidatePageDtoSchema
>;

export const GetOrCreateTelegramDailyPlanDtoSchema = z.object({
  telegramUserId: TelegramUserIdSchema,
  date: TelegramPlanDateSchema,
});
export type GetOrCreateTelegramDailyPlanDto = z.infer<typeof GetOrCreateTelegramDailyPlanDtoSchema>;

export const AddTelegramDailyPlanItemDtoSchema = GetOrCreateTelegramDailyPlanDtoSchema.extend({
  text: z.string().trim().min(1).max(160),
  description: TelegramDailyPlanItemDescriptionSchema.optional(),
});
export type AddTelegramDailyPlanItemDto = z.infer<typeof AddTelegramDailyPlanItemDtoSchema>;

export const UpdateTelegramDailyPlanItemDtoSchema = z
  .object({
    telegramUserId: TelegramUserIdSchema,
    date: TelegramPlanDateSchema,
    itemId: CuidSchema,
    text: z.string().trim().min(1).max(160).optional(),
    description: TelegramDailyPlanItemDescriptionSchema.nullable().optional(),
    completed: z.boolean().optional(),
  })
  .refine(
    dto => dto.text !== undefined || dto.description !== undefined || dto.completed !== undefined,
    {
      message: 'At least one item field must be provided',
    },
  );
export type UpdateTelegramDailyPlanItemDto = z.infer<typeof UpdateTelegramDailyPlanItemDtoSchema>;

export const ToggleTelegramDailyPlanItemDtoSchema = z.object({
  telegramUserId: TelegramUserIdSchema,
  date: TelegramPlanDateSchema,
  itemId: CuidSchema,
});
export type ToggleTelegramDailyPlanItemDto = z.infer<typeof ToggleTelegramDailyPlanItemDtoSchema>;

export const DeleteTelegramDailyPlanItemDtoSchema = ToggleTelegramDailyPlanItemDtoSchema;
export type DeleteTelegramDailyPlanItemDto = z.infer<typeof DeleteTelegramDailyPlanItemDtoSchema>;

export const ClearCompletedTelegramDailyPlanItemsDtoSchema = GetOrCreateTelegramDailyPlanDtoSchema;
export type ClearCompletedTelegramDailyPlanItemsDto = z.infer<
  typeof ClearCompletedTelegramDailyPlanItemsDtoSchema
>;

export const TelegramReminderStatusSchema = z.enum([
  'pending',
  'processing',
  'sent',
  'cancelled',
  'failed',
]);
export type TelegramReminderStatus = z.infer<typeof TelegramReminderStatusSchema>;

const TelegramReminderTextSchema = z.string().trim().min(1).max(1000);
const TelegramReminderDateTimeSchema = z.string().datetime({ offset: true });
const TelegramTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isValidTimezone, { message: 'Invalid IANA timezone' });

export const TelegramReminderRepeatTypeSchema = z.enum([
  'none',
  'interval',
  'daily',
  'weekly',
  'monthly',
  'yearly',
]);
export type TelegramReminderRepeatType = z.infer<typeof TelegramReminderRepeatTypeSchema>;

const TelegramReminderFiniteRepeatLimitSchema = z.number().int().min(2).max(100);
const TelegramReminderCalendarRepeatLimitSchema = z.number().int().min(2).max(1000).nullable();

export const TelegramReminderRecurrenceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('none'),
  }),
  z.object({
    type: z.literal('interval'),
    intervalMinutes: z.number().int().min(5).max(43_200),
    repeatLimit: TelegramReminderFiniteRepeatLimitSchema,
  }),
  z.object({
    type: z.literal('daily'),
    repeatLimit: TelegramReminderCalendarRepeatLimitSchema,
  }),
  z.object({
    type: z.literal('weekly'),
    repeatLimit: TelegramReminderCalendarRepeatLimitSchema,
  }),
  z.object({
    type: z.literal('monthly'),
    repeatLimit: TelegramReminderCalendarRepeatLimitSchema,
  }),
  z.object({
    type: z.literal('yearly'),
    repeatLimit: TelegramReminderCalendarRepeatLimitSchema,
  }),
]);
export type TelegramReminderRecurrence = z.infer<typeof TelegramReminderRecurrenceSchema>;

export const TelegramReminderDtoSchema = z.object({
  id: CuidSchema,
  telegramUserId: TelegramUserIdSchema,
  chatId: TelegramUserIdSchema,
  text: TelegramReminderTextSchema,
  remindAt: TelegramReminderDateTimeSchema,
  timezone: TelegramTimezoneSchema,
  status: TelegramReminderStatusSchema,
  recurrence: TelegramReminderRecurrenceSchema,
  sentCount: z.number().int().min(0),
});
export type TelegramReminderDto = z.infer<typeof TelegramReminderDtoSchema>;

export const CreateTelegramReminderDtoSchema = z.object({
  telegramUserId: TelegramUserIdSchema,
  chatId: TelegramUserIdSchema,
  text: TelegramReminderTextSchema,
  remindAt: TelegramReminderDateTimeSchema,
  timezone: TelegramTimezoneSchema,
  recurrence: TelegramReminderRecurrenceSchema.default({ type: 'none' }),
});
export type CreateTelegramReminderDto = z.infer<typeof CreateTelegramReminderDtoSchema>;

export const ListTelegramRemindersDtoSchema = z.object({
  telegramUserId: TelegramUserIdSchema,
});
export type ListTelegramRemindersDto = z.infer<typeof ListTelegramRemindersDtoSchema>;

export const TelegramReminderListDtoSchema = z.array(TelegramReminderDtoSchema);
export type TelegramReminderListDto = z.infer<typeof TelegramReminderListDtoSchema>;

export const UpdateTelegramReminderDtoSchema = z
  .object({
    telegramUserId: TelegramUserIdSchema,
    reminderId: CuidSchema,
    text: TelegramReminderTextSchema.optional(),
    remindAt: TelegramReminderDateTimeSchema.optional(),
    timezone: TelegramTimezoneSchema.optional(),
    recurrence: TelegramReminderRecurrenceSchema.optional(),
  })
  .refine(
    dto =>
      dto.text !== undefined ||
      dto.remindAt !== undefined ||
      dto.timezone !== undefined ||
      dto.recurrence !== undefined,
    {
      message: 'At least one reminder field must be provided',
    },
  );
export type UpdateTelegramReminderDto = z.infer<typeof UpdateTelegramReminderDtoSchema>;

export const DeleteTelegramReminderDtoSchema = z.object({
  telegramUserId: TelegramUserIdSchema,
  reminderId: CuidSchema,
});
export type DeleteTelegramReminderDto = z.infer<typeof DeleteTelegramReminderDtoSchema>;

export const ClaimTelegramRemindersDtoSchema = z.object({
  limit: z.number().int().min(1).max(20).default(10),
});
export type ClaimTelegramRemindersDto = z.infer<typeof ClaimTelegramRemindersDtoSchema>;

export const ClaimedTelegramReminderDtoSchema = TelegramReminderDtoSchema.extend({
  locale: TelegramLocaleSchema,
  deliveryToken: z.string().uuid(),
});
export type ClaimedTelegramReminderDto = z.infer<typeof ClaimedTelegramReminderDtoSchema>;

export const ClaimedTelegramReminderListDtoSchema = z.array(ClaimedTelegramReminderDtoSchema);
export type ClaimedTelegramReminderListDto = z.infer<typeof ClaimedTelegramReminderListDtoSchema>;

export const CompleteTelegramReminderDeliveryDtoSchema = z.object({
  reminderId: CuidSchema,
  deliveryToken: z.string().uuid(),
});
export type CompleteTelegramReminderDeliveryDto = z.infer<
  typeof CompleteTelegramReminderDeliveryDtoSchema
>;

export const FailTelegramReminderDeliveryDtoSchema =
  CompleteTelegramReminderDeliveryDtoSchema.extend({
    error: z.string().trim().min(1).max(500),
  });
export type FailTelegramReminderDeliveryDto = z.infer<typeof FailTelegramReminderDeliveryDtoSchema>;

export const TelegramReminderDeliveryResultDtoSchema = z.object({
  ok: z.literal(true),
});
export type TelegramReminderDeliveryResultDto = z.infer<
  typeof TelegramReminderDeliveryResultDtoSchema
>;

export const ClaimTelegramDailyPlanRolloversDtoSchema = z.object({
  sourceDate: TelegramPlanDateSchema,
  targetDate: TelegramPlanDateSchema,
  limit: z.number().int().min(1).max(20).default(10),
});
export type ClaimTelegramDailyPlanRolloversDto = z.infer<
  typeof ClaimTelegramDailyPlanRolloversDtoSchema
>;

export const ClaimedTelegramDailyPlanRolloverDtoSchema = z.object({
  sourcePlan: TelegramDailyPlanDtoSchema,
  targetPlan: TelegramDailyPlanDtoSchema,
  locale: TelegramLocaleSchema,
  deliveryToken: z.string().uuid(),
});
export type ClaimedTelegramDailyPlanRolloverDto = z.infer<
  typeof ClaimedTelegramDailyPlanRolloverDtoSchema
>;

export const ClaimedTelegramDailyPlanRolloverListDtoSchema = z.array(
  ClaimedTelegramDailyPlanRolloverDtoSchema,
);
export type ClaimedTelegramDailyPlanRolloverListDto = z.infer<
  typeof ClaimedTelegramDailyPlanRolloverListDtoSchema
>;

export const CompleteTelegramDailyPlanRolloverDtoSchema = z.object({
  sourcePlanId: CuidSchema,
  deliveryToken: z.string().uuid(),
});
export type CompleteTelegramDailyPlanRolloverDto = z.infer<
  typeof CompleteTelegramDailyPlanRolloverDtoSchema
>;

export const FailTelegramDailyPlanRolloverDtoSchema =
  CompleteTelegramDailyPlanRolloverDtoSchema.extend({
    error: z.string().trim().min(1).max(500),
  });
export type FailTelegramDailyPlanRolloverDto = z.infer<
  typeof FailTelegramDailyPlanRolloverDtoSchema
>;

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function validateTelegramReportPeriod(
  report: {
    type: TelegramReportType;
    periodStart: string;
    periodEnd: string;
  },
  context: z.RefinementCtx,
): void {
  const start = Date.parse(`${report.periodStart}T00:00:00.000Z`);
  const end = Date.parse(`${report.periodEnd}T00:00:00.000Z`);
  const expectedDays = report.type === 'daily' ? 0 : 6;

  if (end - start !== expectedDays * 86_400_000) {
    context.addIssue({
      code: 'custom',
      path: ['periodEnd'],
      message:
        report.type === 'daily'
          ? 'Daily report period must contain exactly one date'
          : 'Weekly report period must contain exactly seven dates',
    });
  }
}
