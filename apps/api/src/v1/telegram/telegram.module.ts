import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramDailyPlanRolloverService } from './telegram-daily-plan-rollover.service';
import { TelegramService } from './telegram.service';

@Module({
  controllers: [TelegramController],
  providers: [TelegramService, TelegramDailyPlanRolloverService],
})
export class TelegramModule {}
