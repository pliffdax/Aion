ALTER TABLE "TelegramUser"
ADD COLUMN "reportDailySections" TEXT[] NOT NULL DEFAULT ARRAY[
  'daily-priorities',
  'daily-event',
  'daily-conclusion',
  'daily-tomorrow',
  'daily-rating'
]::TEXT[],
ADD COLUMN "reportWeeklySections" TEXT[] NOT NULL DEFAULT ARRAY[
  'weekly-wins',
  'weekly-failure',
  'weekly-insight',
  'weekly-next',
  'weekly-review'
]::TEXT[];
