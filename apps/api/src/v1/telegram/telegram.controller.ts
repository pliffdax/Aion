import { Body, Controller, Delete, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { v1 } from '@aion/contracts';
import { ApiKeyGuard } from '@/common/api-key.guard';
import { parseBody } from '@/common/zod';
import { TelegramDailyPlanRolloverService } from './telegram-daily-plan-rollover.service';
import { TelegramService } from './telegram.service';

@UseGuards(ApiKeyGuard)
@Controller('v1/telegram')
export class TelegramController {
  constructor(
    private readonly telegram: TelegramService,
    private readonly dailyPlanRollover: TelegramDailyPlanRolloverService,
  ) {}

  @Put('users')
  upsertUser(@Body() body: unknown) {
    return this.telegram.upsertUser(parseBody(v1.UpsertTelegramUserDtoSchema, body));
  }

  @Patch('users/locale')
  updateUserLocale(@Body() body: unknown) {
    return this.telegram.updateUserLocale(parseBody(v1.UpdateTelegramUserLocaleDtoSchema, body));
  }

  @Patch('users/report-profile')
  updateUserReportProfile(@Body() body: unknown) {
    return this.telegram.updateUserReportProfile(
      parseBody(v1.UpdateTelegramReportProfileDtoSchema, body),
    );
  }

  @Put('daily-plans')
  getOrCreateDailyPlan(@Body() body: unknown) {
    return this.telegram.getOrCreateDailyPlan(
      parseBody(v1.GetOrCreateTelegramDailyPlanDtoSchema, body),
    );
  }

  @Post('daily-plans/items')
  addDailyPlanItem(@Body() body: unknown) {
    return this.telegram.addDailyPlanItem(parseBody(v1.AddTelegramDailyPlanItemDtoSchema, body));
  }

  @Patch('daily-plans/items')
  updateDailyPlanItem(@Body() body: unknown) {
    return this.telegram.updateDailyPlanItem(
      parseBody(v1.UpdateTelegramDailyPlanItemDtoSchema, body),
    );
  }

  @Post('daily-plans/items/toggle')
  toggleDailyPlanItem(@Body() body: unknown) {
    return this.telegram.toggleDailyPlanItem(
      parseBody(v1.ToggleTelegramDailyPlanItemDtoSchema, body),
    );
  }

  @Delete('daily-plans/items')
  deleteDailyPlanItem(@Body() body: unknown) {
    return this.telegram.deleteDailyPlanItem(
      parseBody(v1.DeleteTelegramDailyPlanItemDtoSchema, body),
    );
  }

  @Delete('daily-plans/completed')
  clearCompletedDailyPlanItems(@Body() body: unknown) {
    return this.telegram.clearCompletedDailyPlanItems(
      parseBody(v1.ClearCompletedTelegramDailyPlanItemsDtoSchema, body),
    );
  }

  @Post('reminders')
  createReminder(@Body() body: unknown) {
    return this.telegram.createReminder(parseBody(v1.CreateTelegramReminderDtoSchema, body));
  }

  @Post('reminders/list')
  listReminders(@Body() body: unknown) {
    return this.telegram.listReminders(parseBody(v1.ListTelegramRemindersDtoSchema, body));
  }

  @Patch('reminders')
  updateReminder(@Body() body: unknown) {
    return this.telegram.updateReminder(parseBody(v1.UpdateTelegramReminderDtoSchema, body));
  }

  @Delete('reminders')
  cancelReminder(@Body() body: unknown) {
    return this.telegram.cancelReminder(parseBody(v1.DeleteTelegramReminderDtoSchema, body));
  }

  @Post('reminders/delivery/claim')
  claimDueReminders(@Body() body: unknown) {
    return this.telegram.claimDueReminders(parseBody(v1.ClaimTelegramRemindersDtoSchema, body));
  }

  @Post('reminders/delivery/complete')
  completeReminderDelivery(@Body() body: unknown) {
    return this.telegram.completeReminderDelivery(
      parseBody(v1.CompleteTelegramReminderDeliveryDtoSchema, body),
    );
  }

  @Post('reminders/delivery/fail')
  failReminderDelivery(@Body() body: unknown) {
    return this.telegram.failReminderDelivery(
      parseBody(v1.FailTelegramReminderDeliveryDtoSchema, body),
    );
  }

  @Post('daily-plans/rollovers/claim')
  claimDailyPlanRollovers(@Body() body: unknown) {
    return this.dailyPlanRollover.claim(
      parseBody(v1.ClaimTelegramDailyPlanRolloversDtoSchema, body),
    );
  }

  @Post('daily-plans/rollovers/complete')
  completeDailyPlanRollover(@Body() body: unknown) {
    return this.dailyPlanRollover.complete(
      parseBody(v1.CompleteTelegramDailyPlanRolloverDtoSchema, body),
    );
  }

  @Post('daily-plans/rollovers/fail')
  failDailyPlanRollover(@Body() body: unknown) {
    return this.dailyPlanRollover.fail(parseBody(v1.FailTelegramDailyPlanRolloverDtoSchema, body));
  }
}
