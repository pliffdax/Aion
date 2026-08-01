CREATE TYPE "TelegramReminderRepeatType" AS ENUM (
    'NONE',
    'INTERVAL',
    'DAILY',
    'WEEKLY',
    'MONTHLY',
    'YEARLY'
);

ALTER TABLE "TelegramReminder"
ADD COLUMN "repeatType" "TelegramReminderRepeatType" NOT NULL DEFAULT 'NONE',
ADD COLUMN "repeatIntervalMinutes" INTEGER,
ADD COLUMN "repeatLimit" INTEGER,
ADD COLUMN "sentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "recurrenceAnchorAt" TIMESTAMPTZ(3);

UPDATE "TelegramReminder"
SET "recurrenceAnchorAt" = "remindAt";

ALTER TABLE "TelegramReminder"
ALTER COLUMN "recurrenceAnchorAt" SET NOT NULL;

ALTER TABLE "TelegramReminder"
ADD CONSTRAINT "TelegramReminder_repeat_config_check"
CHECK (
    (
        "repeatType" = 'NONE'
        AND "repeatIntervalMinutes" IS NULL
        AND "repeatLimit" IS NULL
    )
    OR (
        "repeatType" = 'INTERVAL'
        AND "repeatIntervalMinutes" BETWEEN 5 AND 43200
        AND "repeatLimit" BETWEEN 2 AND 100
    )
    OR (
        "repeatType" IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')
        AND "repeatIntervalMinutes" IS NULL
        AND ("repeatLimit" IS NULL OR "repeatLimit" BETWEEN 2 AND 1000)
    )
);

ALTER TABLE "TelegramReminder"
ADD CONSTRAINT "TelegramReminder_sentCount_check"
CHECK ("sentCount" >= 0);
