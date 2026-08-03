import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramDailyPlanRolloverService } from './telegram-daily-plan-rollover.service';
import { TelegramService } from './telegram.service';
import { TelegramWeeklyStatisticsService } from './telegram-weekly-statistics.service';

@Module({
  controllers: [TelegramController],
  providers: [TelegramService, TelegramDailyPlanRolloverService, TelegramWeeklyStatisticsService],
})
export class TelegramModule {}
