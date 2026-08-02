import { z } from 'zod';
import { CuidSchema } from './shared';

export const TelegramLocaleSchema = z.enum(['ru', 'uk', 'en']);
export type TelegramLocale = z.infer<typeof TelegramLocaleSchema>;

export const TelegramDailyReportSectionSchema = z.enum([
  'daily-priorities',
  'daily-event',
  'daily-conclusion',
  'daily-tomorrow',
  'daily-rating',
]);
export type TelegramDailyReportSection = z.infer<typeof TelegramDailyReportSectionSchema>;

export const TelegramWeeklyReportSectionSchema = z.enum([
  'weekly-wins',
  'weekly-failure',
  'weekly-insight',
  'weekly-next',
  'weekly-review',
]);
export type TelegramWeeklyReportSection = z.infer<typeof TelegramWeeklyReportSectionSchema>;

export const DefaultTelegramDailyReportSections: TelegramDailyReportSection[] = [
  'daily-priorities',
  'daily-event',
  'daily-conclusion',
  'daily-tomorrow',
  'daily-rating',
];

export const DefaultTelegramWeeklyReportSections: TelegramWeeklyReportSection[] = [
  'weekly-wins',
  'weekly-failure',
  'weekly-insight',
  'weekly-next',
  'weekly-review',
];

function uniqueReportSections<T extends string>(sections: T[]): boolean {
  return new Set(sections).size === sections.length;
}

export const TelegramDailyReportSectionsSchema = z
  .array(TelegramDailyReportSectionSchema)
  .min(1)
  .max(DefaultTelegramDailyReportSections.length)
  .refine(uniqueReportSections, { message: 'Daily report sections must be unique' });

export const TelegramWeeklyReportSectionsSchema = z
  .array(TelegramWeeklyReportSectionSchema)
  .min(1)
  .max(DefaultTelegramWeeklyReportSections.length)
  .refine(uniqueReportSections, { message: 'Weekly report sections must be unique' });

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

export const TelegramDailyPlanItemDtoSchema = z.object({
  id: CuidSchema,
  text: z.string().min(1).max(160),
  completed: z.boolean(),
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

export const GetOrCreateTelegramDailyPlanDtoSchema = z.object({
  telegramUserId: TelegramUserIdSchema,
  date: TelegramPlanDateSchema,
});
export type GetOrCreateTelegramDailyPlanDto = z.infer<typeof GetOrCreateTelegramDailyPlanDtoSchema>;

export const AddTelegramDailyPlanItemDtoSchema = GetOrCreateTelegramDailyPlanDtoSchema.extend({
  text: z.string().trim().min(1).max(160),
});
export type AddTelegramDailyPlanItemDto = z.infer<typeof AddTelegramDailyPlanItemDtoSchema>;

export const UpdateTelegramDailyPlanItemDtoSchema = z
  .object({
    telegramUserId: TelegramUserIdSchema,
    date: TelegramPlanDateSchema,
    itemId: CuidSchema,
    text: z.string().trim().min(1).max(160).optional(),
    completed: z.boolean().optional(),
  })
  .refine(dto => dto.text !== undefined || dto.completed !== undefined, {
    message: 'At least one item field must be provided',
  });
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
